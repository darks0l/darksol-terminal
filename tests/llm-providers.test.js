import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function importFresh(relativePath) {
  const url = new URL(`${relativePath}?t=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(url);
}

function setTempEnv(tempRoot) {
  const home = join(tempRoot, 'home');
  const appData = join(tempRoot, 'appdata');
  const localAppData = join(tempRoot, 'localappdata');
  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  const prev = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OLLAMA_HOST: process.env.OLLAMA_HOST,
    BANKR_LLM_KEY: process.env.BANKR_LLM_KEY,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    SURPLUS_API_KEY: process.env.SURPLUS_API_KEY,
  };

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OLLAMA_HOST;
  delete process.env.BANKR_LLM_KEY;
  delete process.env.MINIMAX_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.SURPLUS_API_KEY;

  return prev;
}

function restoreEnv(prev) {
  for (const key of Object.keys(prev)) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-9;]*m/g, '');
}

let tempRoot;
let prevEnv;
let keys;
let llm;
let web;

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-llm-'));
  prevEnv = setTempEnv(tempRoot);
  keys = await importFresh('../src/config/keys.js');
  llm = await importFresh('../src/llm/engine.js');
  web = await importFresh('../src/web/commands.js');
});

after(() => {
  restoreEnv(prevEnv);
  rmSync(tempRoot, { recursive: true, force: true });
});

test('MiniMax is registered as an LLM provider', () => {
  assert.equal(llm.PROVIDERS.minimax.url, 'https://api.minimax.io/v1/chat/completions');
  assert.equal(llm.PROVIDERS.minimax.defaultModel, 'MiniMax-M2.5');
  assert.equal(keys.SERVICES.minimax.envVar, 'MINIMAX_API_KEY');
  assert.equal(keys.SERVICES.minimax.category, 'llm');
});

test('MiniMax env key counts toward hasAnyLLM', () => {
  assert.equal(keys.hasAnyLLM(), false);
  process.env.MINIMAX_API_KEY = 'minimax-test-key-12345';
  assert.equal(keys.hasKey('minimax'), true);
  assert.equal(keys.hasAnyLLM(), true);
  delete process.env.MINIMAX_API_KEY;
});

test('web AI status and keys menu include MiniMax', async () => {
  const status = stripAnsi(web.getAIStatus());
  assert.match(status, /keys add minimax <key>/);
  assert.match(status, /MiniMax \(MiniMax-M2\.5\)/);

  const lines = [];
  const menus = [];
  const ws = {
    sendLine: (line) => lines.push(stripAnsi(line)),
    sendMenu: (id, title, items) => menus.push({ id, title: stripAnsi(title), items }),
  };

  await web.handleCommand('keys', ws);

  assert.ok(lines.some((line) => line.includes('MiniMax')));
  assert.ok(lines.some((line) => line.includes('keys add minimax <key>')));
  const keysMenu = menus.find((menu) => menu.id === 'keys_provider');
  assert.ok(keysMenu);
  assert.ok(keysMenu.items.some((item) => item.value === 'minimax'));
});

test('NVIDIA NIM is registered as an LLM provider', () => {
  assert.equal(llm.PROVIDERS.nvidia.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(llm.PROVIDERS.nvidia.defaultModel, 'nvidia/llama-3.1-nemotron-70b-instruct');
  assert.equal(keys.SERVICES.nvidia.envVar, 'NVIDIA_API_KEY');
  assert.equal(keys.SERVICES.nvidia.category, 'llm');
});

test('NVIDIA NIM authHeader returns Bearer token', () => {
  const headers = llm.PROVIDERS.nvidia.authHeader('nvapi-test-key');
  assert.deepEqual(headers, { Authorization: 'Bearer nvapi-test-key' });
});

test('NVIDIA NIM parseResponse extracts content from OpenAI format', () => {
  const data = { choices: [{ message: { role: 'assistant', content: 'Hello from NIM' } }] };
  assert.equal(llm.PROVIDERS.nvidia.parseResponse(data), 'Hello from NIM');
});

test('NVIDIA NIM parseResponse handles empty response', () => {
  assert.equal(llm.PROVIDERS.nvidia.parseResponse({}), undefined);
  assert.equal(llm.PROVIDERS.nvidia.parseResponse({ choices: [] }), undefined);
});

test('NVIDIA NIM parseUsage extracts token usage', () => {
  const data = { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
  const usage = llm.PROVIDERS.nvidia.parseUsage(data);
  assert.equal(usage.prompt_tokens, 10);
  assert.equal(usage.completion_tokens, 20);
});

test('NVIDIA NIM env key counts toward hasAnyLLM', () => {
  assert.equal(keys.hasAnyLLM(), false);
  process.env.NVIDIA_API_KEY = 'nvapi-test-key-12345';
  assert.equal(keys.hasKey('nvidia'), true);
  assert.equal(keys.hasAnyLLM(), true);
  delete process.env.NVIDIA_API_KEY;
});

test('setup wizard source includes MiniMax and llm.provider config writes', () => {
  const wizard = readFileSync(new URL('../src/setup/wizard.js', import.meta.url), 'utf8');
  assert.match(wizard, /MiniMax \(MiniMax-M2\.5\) - API key/);
  assert.match(wizard, /Surplus Intelligence \(marketplace models\) - API key/);
  assert.match(wizard, /setConfig\('llm\.provider', provider\)/);
  assert.match(wizard, /setConfig\('llm\.provider', 'ollama'\)/);
});

test('Surplus is registered as an LLM provider', () => {
  assert.equal(llm.PROVIDERS.surplus.url, 'https://www.surplusintelligence.ai/api/inference/v1/chat/completions');
  assert.equal(llm.PROVIDERS.surplus.defaultModel, 'llama-3.3-70b');
  assert.equal(keys.SERVICES.surplus.envVar, 'SURPLUS_API_KEY');
  assert.equal(keys.SERVICES.surplus.category, 'llm');
});

test('Surplus env key counts toward hasAnyLLM', () => {
  assert.equal(keys.hasAnyLLM(), false);
  process.env.SURPLUS_API_KEY = 'inf_test_surplus_key_12345';
  assert.equal(keys.hasKey('surplus'), true);
  assert.equal(keys.hasAnyLLM(), true);
  delete process.env.SURPLUS_API_KEY;
});

test('web AI status and keys menu include Surplus', async () => {
  const status = stripAnsi(web.getAIStatus());
  assert.match(status, /Surplus/);

  const lines = [];
  const menus = [];
  const ws = {
    sendLine: (line) => lines.push(stripAnsi(line)),
    sendMenu: (id, title, items) => menus.push({ id, title: stripAnsi(title), items }),
  };

  await web.handleCommand('keys', ws);

  assert.ok(lines.some((line) => line.includes('Surplus Intelligence')));
  const keysMenu = menus.find((menu) => menu.id === 'keys_provider');
  assert.ok(keysMenu);
  assert.ok(keysMenu.items.some((item) => item.value === 'surplus'));
});
