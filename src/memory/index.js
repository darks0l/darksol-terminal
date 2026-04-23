import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const MEMORY_DIR = join(homedir(), '.darksol', 'memory');
const MEMORY_FILE = join(MEMORY_DIR, 'memory.json');
const MEMORY_CATEGORIES = new Set(['preference', 'fact', 'decision', 'lesson']);
const MEMORY_PATTERNS = [
  { regex: /\b(i prefer|i like|i usually|my favorite)\b/i, category: 'preference' },
  { regex: /\b(remember that|remember this|my address is|i live at|my phone number is)\b/i, category: 'fact' },
  { regex: /\b(always|never|from now on|do not|don't)\b/i, category: 'decision' },
  { regex: /\b(i learned|lesson|next time|that means)\b/i, category: 'lesson' },
];

/**
 * Ensure the memory directory and file exist.
 * @returns {Promise<void>}
 */
async function ensureMemoryStore() {
  await mkdir(MEMORY_DIR, { recursive: true });
  if (!existsSync(MEMORY_FILE)) {
    await writeFile(MEMORY_FILE, '[]\n', 'utf8');
  }
}

/**
 * Load all persistent memories from disk.
 * @returns {Promise<Array<{id: string, content: string, category: string, timestamp: string, source: string}>>}
 */
export async function loadMemories() {
  await ensureMemoryStore();

  try {
    const raw = await readFile(MEMORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist the full memory list.
 * @param {Array<object>} memories
 * @returns {Promise<void>}
 */
async function writeMemories(memories) {
  await ensureMemoryStore();
  await writeFile(MEMORY_FILE, `${JSON.stringify(memories, null, 2)}\n`, 'utf8');
}

/**
 * Save a memory item to disk.
 * @param {string} content
 * @param {'preference'|'fact'|'decision'|'lesson'} category
 * @param {string} [source='user']
 * @returns {Promise<object|null>}
 */
export async function saveMemory(content, category, source = 'user') {
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;

  const finalCategory = MEMORY_CATEGORIES.has(category) ? category : 'fact';
  const memories = await loadMemories();
  const duplicate = memories.find((memory) => memory.content.toLowerCase() === trimmed.toLowerCase());
  if (duplicate) return duplicate;

  const entry = {
    id: randomUUID(),
    content: trimmed,
    category: finalCategory,
    timestamp: new Date().toISOString(),
    source,
  };

  memories.push(entry);
  await writeMemories(memories);
  return entry;
}

/**
 * Search memories by a text query.
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
export async function searchMemories(query) {
  const trimmed = String(query || '').trim().toLowerCase();
  if (!trimmed) return [];

  const terms = trimmed.split(/\s+/).filter(Boolean);
  const memories = await loadMemories();

  return memories
    .map((memory) => {
      const haystack = `${memory.content} ${memory.category} ${memory.source}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { memory, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.memory.timestamp).getTime() - new Date(a.memory.timestamp).getTime();
    })
    .map(({ memory }) => memory);
}

/**
 * Return the most recent N memories.
 * @param {number} [n=10]
 * @returns {Promise<Array<object>>}
 */
export async function getRecentMemories(n = 10) {
  const memories = await loadMemories();
  return [...memories]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, n);
}

/**
 * Remove memories older than maxAge milliseconds.
 * @param {number} maxAge
 * @returns {Promise<number>}
 */
export async function pruneMemories(maxAge) {
  if (!Number.isFinite(maxAge) || maxAge <= 0) return 0;

  const cutoff = Date.now() - maxAge;
  const memories = await loadMemories();
  const kept = memories.filter((memory) => new Date(memory.timestamp).getTime() >= cutoff);
  await writeMemories(kept);
  return memories.length - kept.length;
}

/**
 * Remove all persistent memories.
 * @returns {Promise<void>}
 */
export async function clearMemories() {
  await ensureMemoryStore();
  await writeMemories([]);
}

/**
 * Export memories to a JSON file and return its path.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function exportMemories(filePath) {
  const memories = await loadMemories();
  await writeFile(filePath, `${JSON.stringify(memories, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * Attempt to extract memory-worthy statements from a message.
 * @param {string} content
 * @param {string} [source='user']
 * @returns {Promise<Array<object>>}
 */
export async function extractMemories(content, source = 'user') {
  const text = String(content || '').trim();
  if (!text) return [];

  const segments = text
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const saved = [];
  for (const segment of segments) {
    for (const pattern of MEMORY_PATTERNS) {
      if (pattern.regex.test(segment)) {
        const memory = await saveMemory(segment, pattern.category, source);
        if (memory) saved.push(memory);
        break;
      }
    }
  }

  return saved;
}

/**
 * In-session conversation memory with rolling compaction.
 */
export class SessionMemory {
  /**
   * @param {{maxTurns?: number}} [opts]
   */
  constructor(opts = {}) {
    this.maxTurns = opts.maxTurns || 20;
    this.messages = [];
    this.summary = '';
  }

  /**
   * Add a new turn to the current session.
   * @param {'user'|'assistant'|'system'} role
   * @param {string} content
   * @returns {void}
   */
  addTurn(role, content) {
    const trimmed = String(content || '').trim();
    if (!trimmed) return;
    this.messages.push({ role, content: trimmed });
  }

  /**
   * Return recent conversation turns.
   * @returns {Array<{role: string, content: string}>}
   */
  getContext() {
    return [...this.messages];
  }

  /**
   * Return the current summary, if one exists.
   * @returns {string}
   */
  getSummary() {
    return this.summary;
  }

  /**
   * Clear all session memory.
   * @returns {void}
   */
  clear() {
    this.messages = [];
    this.summary = '';
  }

  /**
   * Compact older turns into a structured summary with help from the LLM.
   * Uses a 5-section format inspired by Claude Code's compaction prompts:
   * Intent, Key Details, Errors/Fixes, User Messages, Current Work.
   * The LLM writes an <analysis> scratchpad (stripped) then a <summary> (kept).
   *
   * @param {{complete: (prompt: string, opts?: object) => Promise<{content: string}>}} llm
   * @returns {Promise<void>}
   */
  async compact(llm) {
    if (this.messages.length <= this.maxTurns) return;

    const overflow = this.messages.length - this.maxTurns;
    const batchSize = Math.max(overflow, Math.ceil(this.maxTurns / 2));
    const olderMessages = this.messages.splice(0, batchSize);
    const transcript = olderMessages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n');

    const prompt = [
      'Summarize this conversation context for future replies. Respond with TEXT ONLY.',
      '',
      'Before your summary, wrap your analysis in <analysis> tags to organize thoughts.',
      'Then provide a <summary> with these sections:',
      '',
      '1. Intent: What the user wants and key requests',
      '2. Key Details: Technical concepts, file names, code patterns, decisions',
      '3. Errors & Fixes: Problems encountered and how they were resolved',
      '4. User Messages: Key non-trivial user messages (not tool results)',
      '5. Current Work: What was being worked on most recently',
      '',
      this.summary ? `Existing summary to incorporate:\n${this.summary}` : '',
      `Conversation to compact:\n${transcript}`,
      '',
      'Keep the summary under 250 words. Be precise — preserve names, paths, and decisions.',
    ].filter(Boolean).join('\n');

    try {
      const result = await llm.complete(prompt, {
        ephemeral: true,
        skipContext: true,
        skipMemoryExtraction: true,
      });
      const raw = String(result.content || '').trim();
      this.summary = formatCompactSummary(raw) || this.summary;
    } catch {
      const fallback = olderMessages
        .slice(-4)
        .map((message) => `${message.role}: ${message.content}`)
        .join(' | ');
      this.summary = [this.summary, fallback].filter(Boolean).join(' | ').slice(-1200);
    }
  }
}

/**
 * Strip <analysis> scratchpad and extract <summary> content.
 * The analysis block improves summary quality (chain-of-thought) but
 * has no value once the summary is written.
 * @param {string} raw - Raw LLM response
 * @returns {string} Cleaned summary
 */
export function formatCompactSummary(raw) {
  if (!raw) return '';
  let result = raw;

  // Strip analysis section
  result = result.replace(/<analysis>[\s\S]*?<\/analysis>/i, '');

  // Extract summary content
  const match = result.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (match) {
    result = match[1].trim();
  }

  // Clean up whitespace
  result = result.replace(/\n\n+/g, '\n\n').trim();
  return result;
}

export { MEMORY_DIR, MEMORY_FILE };
