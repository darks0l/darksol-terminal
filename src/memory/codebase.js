import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { createRequire } from 'module';
import { basename, dirname, extname, join, relative, resolve } from 'path';
import { MEMORY_DIR } from './index.js';

const require = createRequire(import.meta.url);
const { ReMEM, createCodebaseMemoryAdapter } = require('@darksol/remem');

const GRAPH_DIR = join(MEMORY_DIR, 'codebase-graphs');
const DEFAULT_DB_PATH = join(MEMORY_DIR, 'codebase-remem.db');
const DEFAULT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const DEFAULT_EXCLUDES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.vercel',
  '.wrangler',
  'target',
]);

function normalizeRel(path) {
  const rel = path.replace(/\\/g, '/');
  return rel === '' ? '.' : rel;
}

function inferLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  return ext.replace(/^\./, '') || 'text';
}

function projectNameFromRoot(root) {
  return basename(root) || 'codebase';
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.from}\0${edge.to}\0${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function walkFiles(root, opts = {}) {
  const excludes = new Set([...(opts.excludeDirs || []), ...DEFAULT_EXCLUDES]);
  const extensions = new Set(opts.extensions || DEFAULT_EXTENSIONS);
  const maxFiles = Number.isFinite(opts.maxFiles) && opts.maxFiles > 0 ? opts.maxFiles : 750;
  const files = [];

  async function walk(dir) {
    if (files.length >= maxFiles) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!excludes.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files;
}

function extractSymbols(source) {
  const symbols = [];
  const patterns = [
    { kind: 'Function', regex: /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'Function', regex: /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'Class', regex: /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'Class', regex: /\bclass\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'Constant', regex: /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=/g },
    { kind: 'Constant', regex: /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g },
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(source))) {
      const name = match[1];
      if (!symbols.some((symbol) => symbol.name === name && symbol.kind === pattern.kind)) {
        symbols.push({ name, kind: pattern.kind });
      }
    }
  }

  return symbols;
}

function extractImports(source) {
  const imports = new Set();
  const patterns = [
    /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      imports.add(match[1]);
    }
  }

  return [...imports];
}

function resolveRelativeImport(root, fromFile, specifier, fileIdByAbsPath) {
  if (!specifier.startsWith('.')) return null;

  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...[...DEFAULT_EXTENSIONS].map((ext) => `${base}${ext}`),
    ...[...DEFAULT_EXTENSIONS].map((ext) => join(base, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (fileIdByAbsPath.has(resolved)) return fileIdByAbsPath.get(resolved);
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      const rel = normalizeRel(relative(root, resolved));
      return `file:${rel}`;
    }
  }

  return null;
}

function packageName(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split('/')[0];
}

export function getDefaultCodebaseDbPath() {
  return DEFAULT_DB_PATH;
}

export async function buildCodebaseGraph(repoPath = '.', opts = {}) {
  const root = resolve(repoPath);
  const project = opts.project || projectNameFromRoot(root);
  const files = await walkFiles(root, opts);
  const fileIdByAbsPath = new Map();
  const nodes = [
    {
      id: `project:${project}`,
      label: 'Project',
      name: project,
      path: '.',
      summary: `Codebase graph for ${project}.`,
    },
  ];
  const edges = [];

  for (const file of files) {
    const rel = normalizeRel(relative(root, file));
    fileIdByAbsPath.set(resolve(file), `file:${rel}`);
  }

  const directoryIds = new Set();
  for (const file of files) {
    const rel = normalizeRel(relative(root, file));
    const fileId = `file:${rel}`;
    const dirRel = normalizeRel(dirname(rel));
    const dirId = dirRel === '.' ? `project:${project}` : `dir:${dirRel}`;

    if (dirRel !== '.' && !directoryIds.has(dirRel)) {
      directoryIds.add(dirRel);
      nodes.push({
        id: dirId,
        label: 'Directory',
        name: basename(dirRel),
        path: dirRel,
        summary: `Directory ${dirRel}.`,
      });
      const parentRel = normalizeRel(dirname(dirRel));
      const parentId = parentRel === '.' ? `project:${project}` : `dir:${parentRel}`;
      edges.push({ from: parentId, to: dirId, type: 'CONTAINS' });
    }

    nodes.push({
      id: fileId,
      label: 'File',
      name: basename(file),
      path: rel,
      language: inferLanguage(file),
      summary: `${rel} source file.`,
    });
    edges.push({ from: dirId, to: fileId, type: 'CONTAINS' });

    const source = await readFile(file, 'utf8');
    for (const symbol of extractSymbols(source)) {
      const symbolId = `symbol:${rel}#${symbol.name}`;
      nodes.push({
        id: symbolId,
        label: symbol.kind,
        name: symbol.name,
        path: rel,
        language: inferLanguage(file),
        summary: `${symbol.kind} ${symbol.name} defined in ${rel}.`,
      });
      edges.push({ from: fileId, to: symbolId, type: 'DEFINES' });
    }

    for (const specifier of extractImports(source)) {
      const targetFileId = resolveRelativeImport(root, file, specifier, fileIdByAbsPath);
      if (targetFileId) {
        edges.push({ from: fileId, to: targetFileId, type: 'IMPORTS' });
        continue;
      }

      if (!specifier.startsWith('.')) {
        const pkg = packageName(specifier);
        const pkgId = `package:${pkg}`;
        nodes.push({
          id: pkgId,
          label: 'Package',
          name: pkg,
          path: pkg,
          summary: `External package ${pkg}.`,
        });
        edges.push({ from: fileId, to: pkgId, type: 'IMPORTS' });
      }
    }
  }

  return {
    source: 'darksol-terminal',
    project,
    artifactPath: '',
    nodes: uniqueById(nodes),
    edges: uniqueEdges(edges),
  };
}

async function writeGraphArtifact(graph, project) {
  await mkdir(GRAPH_DIR, { recursive: true });
  const safeProject = String(project || 'codebase').replace(/[^A-Za-z0-9_.-]+/g, '-');
  const artifactPath = join(GRAPH_DIR, `${safeProject}-graph.json`);
  const withArtifact = { ...graph, artifactPath };
  await writeFile(artifactPath, `${JSON.stringify(withArtifact, null, 2)}\n`, 'utf8');
  return withArtifact;
}

async function openCodebaseMemory(dbPath = DEFAULT_DB_PATH) {
  await mkdir(dirname(dbPath), { recursive: true });
  const memory = new ReMEM({ storage: 'sqlite', dbPath });
  await memory.init();
  return memory;
}

export async function ingestCodebase(repoPath = '.', opts = {}) {
  const graph = await buildCodebaseGraph(repoPath, opts);
  const artifact = await writeGraphArtifact(graph, graph.project);
  const memory = await openCodebaseMemory(opts.dbPath || DEFAULT_DB_PATH);
  try {
    const adapter = createCodebaseMemoryAdapter(memory);
    const result = await adapter.ingestGraph(artifact);
    return {
      ...result,
      dbPath: opts.dbPath || DEFAULT_DB_PATH,
      artifactPath: artifact.artifactPath,
      filesScanned: artifact.nodes.filter((node) => node.label === 'File').length,
      symbolsFound: artifact.nodes.filter((node) => ['Function', 'Class', 'Constant'].includes(node.label)).length,
    };
  } finally {
    memory.close();
  }
}

export async function searchCodebaseGraph(query, opts = {}) {
  const memory = await openCodebaseMemory(opts.dbPath || DEFAULT_DB_PATH);
  try {
    const adapter = createCodebaseMemoryAdapter(memory);
    return await adapter.searchGraph(query, {
      project: opts.project,
      limit: opts.limit,
    });
  } finally {
    memory.close();
  }
}

export async function impactCodebaseGraph(query, opts = {}) {
  const memory = await openCodebaseMemory(opts.dbPath || DEFAULT_DB_PATH);
  try {
    const adapter = createCodebaseMemoryAdapter(memory);
    return await adapter.impact(query, {
      project: opts.project,
      limit: opts.limit,
      neighborLimit: opts.neighborLimit,
    });
  } finally {
    memory.close();
  }
}
