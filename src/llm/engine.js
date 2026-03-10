import fetch from 'node-fetch';
import { getKeyFromEnv, getKey, SERVICES } from '../config/keys.js';
import { getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// ──────────────────────────────────────────────────
// LLM PROVIDER ADAPTERS
// ──────────────────────────────────────────────────

const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    buildBody: (model, messages, systemPrompt) => ({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    }),
    parseResponse: (data) => data.content?.[0]?.text,
    parseUsage: (data) => ({ input: data.usage?.input_tokens, output: data.usage?.output_tokens }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    authHeader: (key) => ({
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://darksol.net',
      'X-Title': 'DARKSOL Terminal',
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  ollama: {
    url: null, // Set from config
    defaultModel: 'llama3.1',
    authHeader: () => ({}),
    parseResponse: (data) => data.choices?.[0]?.message?.content || data.message?.content,
    parseUsage: () => ({ input: 0, output: 0 }),
  },
  bankr: {
    url: 'https://llm.bankr.bot/v1/chat/completions',
    defaultModel: 'claude-sonnet-4.6',
    authHeader: (key) => ({ 'X-API-Key': key }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
};

// ──────────────────────────────────────────────────
// LLM ENGINE
// ──────────────────────────────────────────────────

export class LLMEngine {
  constructor(opts = {}) {
    this.provider = opts.provider || getConfig('llm.provider') || 'openai';
    this.model = opts.model || getConfig('llm.model') || null;
    this.apiKey = opts.apiKey || null;
    this.conversationHistory = [];
    this.systemPrompt = '';
    this.maxHistoryTokens = opts.maxHistory || 8000;
    this.temperature = opts.temperature ?? 0.7;

    // Usage tracking
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCalls = 0;
  }

  /**
   * Initialize the engine — resolve API key
   */
  async init(vaultPassword) {
    if (!this.apiKey) {
      // Try env first, then vault
      this.apiKey = getKeyFromEnv(this.provider);
      if (!this.apiKey && vaultPassword) {
        this.apiKey = await getKey(this.provider, vaultPassword);
      }
    }

    if (!this.apiKey && this.provider !== 'ollama') {
      // Try auto-stored keys as last resort
      const { getKeyAuto } = await import('../config/keys.js');
      this.apiKey = getKeyAuto(this.provider);
    }

    if (!this.apiKey && this.provider !== 'ollama') {
      throw new Error(`No API key for ${this.provider}. Run: darksol keys add ${this.provider}`);
    }

    const providerConfig = PROVIDERS[this.provider];
    if (!providerConfig) {
      throw new Error(`Unknown LLM provider: ${this.provider}. Supported: ${Object.keys(PROVIDERS).join(', ')}`);
    }

    if (!this.model) {
      this.model = providerConfig.defaultModel;
    }

    // Ollama URL from config
    if (this.provider === 'ollama') {
      const host = this.apiKey || getConfig('llm.ollamaHost') || 'http://localhost:11434';
      PROVIDERS.ollama.url = `${host}/v1/chat/completions`;
      this.apiKey = 'ollama'; // placeholder
    }

    return this;
  }

  /**
   * Set the system prompt (persona/context for the LLM)
   */
  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
    return this;
  }

  /**
   * Send a message and get a response
   */
  async chat(userMessage, opts = {}) {
    const providerConfig = PROVIDERS[this.provider];

    // Build messages array
    const messages = [];
    if (this.systemPrompt && this.provider !== 'anthropic') {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

    // Add conversation history
    for (const msg of this.conversationHistory) {
      messages.push(msg);
    }

    messages.push({ role: 'user', content: userMessage });

    // Build request body
    let body;
    if (providerConfig.buildBody) {
      body = providerConfig.buildBody(this.model, messages, this.systemPrompt);
    } else {
      body = {
        model: this.model,
        messages,
        temperature: opts.temperature ?? this.temperature,
        max_tokens: opts.maxTokens || 4096,
      };

      // JSON mode if requested
      if (opts.json) {
        body.response_format = { type: 'json_object' };
      }
    }

    const url = providerConfig.url;
    const headers = {
      'Content-Type': 'application/json',
      ...providerConfig.authHeader(this.apiKey),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = providerConfig.parseResponse(data);
    const usage = providerConfig.parseUsage(data);

    // Track usage
    this.totalCalls++;
    if (usage) {
      this.totalInputTokens += usage.input_tokens || usage.prompt_tokens || usage.input || 0;
      this.totalOutputTokens += usage.output_tokens || usage.completion_tokens || usage.output || 0;
    }

    // Store in history
    if (!opts.ephemeral) {
      this.conversationHistory.push({ role: 'user', content: userMessage });
      this.conversationHistory.push({ role: 'assistant', content });
      this._trimHistory();
    }

    return {
      content,
      usage,
      model: this.model,
      provider: this.provider,
    };
  }

  /**
   * One-shot completion (no history)
   */
  async complete(prompt, opts = {}) {
    return this.chat(prompt, { ...opts, ephemeral: true });
  }

  /**
   * Get structured JSON response
   */
  async json(prompt, opts = {}) {
    const result = await this.chat(
      prompt + '\n\nRespond with valid JSON only. No markdown, no explanation.',
      { ...opts, ephemeral: true }
    );

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = result.content;
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) jsonStr = match[1];

      result.parsed = JSON.parse(jsonStr.trim());
    } catch {
      result.parsed = null;
    }

    return result;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
    return this;
  }

  /**
   * Get usage stats
   */
  getUsage() {
    return {
      calls: this.totalCalls,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      provider: this.provider,
      model: this.model,
    };
  }

  /**
   * Trim history to stay within token budget (rough estimate)
   */
  _trimHistory() {
    // Rough: 1 token ≈ 4 chars
    const estimateTokens = (msgs) => msgs.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

    while (this.conversationHistory.length > 2 && estimateTokens(this.conversationHistory) > this.maxHistoryTokens) {
      // Remove oldest pair (user + assistant)
      this.conversationHistory.splice(0, 2);
    }
  }
}

// ──────────────────────────────────────────────────
// FACTORY
// ──────────────────────────────────────────────────

/**
 * Create and initialize an LLM engine
 */
export async function createLLM(opts = {}) {
  const engine = new LLMEngine(opts);
  await engine.init(opts.vaultPassword);
  return engine;
}

/**
 * Quick one-shot LLM call (auto-resolves provider/key)
 */
export async function ask(prompt, opts = {}) {
  const engine = await createLLM(opts);
  return engine.complete(prompt, opts);
}

export { PROVIDERS };
