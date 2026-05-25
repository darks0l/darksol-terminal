import fetch from 'node-fetch';
import { getKeyFromEnv, getKey } from '../config/keys.js';
import { getConfig } from '../config/store.js';
import { SessionMemory, extractMemories, searchMemories } from '../memory/index.js';
import { formatSystemPrompt as formatSoulSystemPrompt } from '../soul/index.js';
import { getProviderDefaultModel } from './models.js';
import { estimateCost } from './tokens.js';

const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: getProviderDefaultModel('openai'),
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: getProviderDefaultModel('anthropic'),
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    buildBody: (model, messages, systemPrompt) => ({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((message) => ({
        role: message.role === 'system' ? 'user' : message.role,
        content: message.content,
      })),
    }),
    parseResponse: (data) => data.content?.[0]?.text,
    parseUsage: (data) => ({ input: data.usage?.input_tokens, output: data.usage?.output_tokens }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: getProviderDefaultModel('openrouter'),
    authHeader: (key) => ({
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://darksol.net',
      'X-Title': 'DARKSOL Terminal',
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  minimax: {
    url: 'https://api.minimax.io/v1/chat/completions',
    defaultModel: getProviderDefaultModel('minimax'),
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultModel: getProviderDefaultModel('nvidia'),
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  ollama: {
    url: null,
    defaultModel: getProviderDefaultModel('ollama'),
    authHeader: () => ({}),
    parseResponse: (data) => data.choices?.[0]?.message?.content || data.message?.content,
    parseUsage: () => ({ input: 0, output: 0 }),
  },
  bankr: {
    url: 'https://llm.bankr.bot/v1/chat/completions',
    defaultModel: getProviderDefaultModel('bankr'),
    authHeader: (key) => ({ 'X-API-Key': key }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
  surplus: {
    url: 'https://www.surplusintelligence.ai/api/inference/v1/chat/completions',
    defaultModel: getProviderDefaultModel('surplus'),
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    parseUsage: (data) => data.usage,
  },
};

export class LLMEngine {
  constructor(opts = {}) {
    this.provider = opts.provider || getConfig('llm.provider') || 'openai';
    this.model = opts.model || getConfig('llm.model') || null;
    this.apiKey = opts.apiKey || null;
    this.systemPrompt = '';
    this.temperature = opts.temperature ?? 0.7;
    this.sessionMemory = opts.sessionMemory || new SessionMemory({ maxTurns: opts.maxTurns || 20 });
    this.maxRelevantMemories = opts.maxRelevantMemories || 5;

    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCalls = 0;
  }

  async init(vaultPassword) {
    if (!this.apiKey) {
      this.apiKey = getKeyFromEnv(this.provider);
      if (!this.apiKey && vaultPassword) {
        this.apiKey = await getKey(this.provider, vaultPassword);
      }
    }

    if (!this.apiKey && this.provider !== 'ollama') {
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

    this.model = this.model || providerConfig.defaultModel || getProviderDefaultModel(this.provider);

    if (this.provider === 'ollama') {
      const host = this.apiKey || getConfig('llm.ollamaHost') || 'http://localhost:11434';
      PROVIDERS.ollama.url = `${host}/v1/chat/completions`;
      this.apiKey = 'ollama';
    }

    return this;
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
    return this;
  }

  async chat(userMessage, opts = {}) {
    const providerConfig = PROVIDERS[this.provider];
    const systemPrompt = opts.skipContext
      ? (opts.systemPrompt || this.systemPrompt || '')
      : await this._buildSystemPrompt(userMessage, opts.systemPrompt);
    const messages = [];

    if (systemPrompt && this.provider !== 'anthropic') {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (!opts.skipContext) {
      for (const message of this.sessionMemory.getContext()) {
        messages.push(message);
      }
    }

    messages.push({ role: 'user', content: userMessage });

    let body;
    if (providerConfig.buildBody) {
      body = providerConfig.buildBody(this.model, messages, systemPrompt);
    } else {
      body = {
        model: this.model,
        messages,
        temperature: opts.temperature ?? this.temperature,
        max_tokens: opts.maxTokens || 4096,
      };

      if (opts.json) {
        body.response_format = { type: 'json_object' };
      }
    }

    const response = await fetch(providerConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...providerConfig.authHeader(this.apiKey),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = providerConfig.parseResponse(data);
    const usage = providerConfig.parseUsage(data);

    this.totalCalls++;
    if (usage) {
      this.totalInputTokens += usage.input_tokens || usage.prompt_tokens || usage.input || 0;
      this.totalOutputTokens += usage.output_tokens || usage.completion_tokens || usage.output || 0;
    }

    if (!opts.ephemeral) {
      this.sessionMemory.addTurn('user', userMessage);
      this.sessionMemory.addTurn('assistant', content);
      await this.sessionMemory.compact(this);

      if (!opts.skipMemoryExtraction) {
        await extractMemories(userMessage, 'user');
        await extractMemories(content, 'assistant');
      }
    }

    return {
      content,
      usage,
      model: this.model,
      provider: this.provider,
    };
  }

  async complete(prompt, opts = {}) {
    return this.chat(prompt, { ...opts, ephemeral: true });
  }

  async json(prompt, opts = {}) {
    const result = await this.chat(
      `${prompt}\n\nRespond with valid JSON only. No markdown, no explanation.`,
      { ...opts, ephemeral: true }
    );

    try {
      let jsonStr = result.content;
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) jsonStr = match[1];

      result.parsed = JSON.parse(jsonStr.trim());
    } catch {
      result.parsed = null;
    }

    return result;
  }

  clearHistory() {
    this.sessionMemory.clear();
    return this;
  }

  getUsage() {
    const { costUsd, found } = estimateCost(this.totalInputTokens, this.totalOutputTokens, this.model);
    return {
      calls: this.totalCalls,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      estimatedCostUsd: found ? costUsd : undefined,
      provider: this.provider,
      model: this.model,
    };
  }

  async _buildSystemPrompt(userMessage, overridePrompt) {
    const parts = [];
    const soulPrompt = formatSoulSystemPrompt();
    if (soulPrompt) parts.push(soulPrompt);
    if (overridePrompt || this.systemPrompt) parts.push(overridePrompt || this.systemPrompt);

    const summary = this.sessionMemory.getSummary();
    if (summary) {
      parts.push(`Session summary:\n${summary}`);
    }

    const relevantMemories = await searchMemories(userMessage);
    if (relevantMemories.length > 0) {
      parts.push(
        `Relevant persistent memories:\n${relevantMemories
          .slice(0, this.maxRelevantMemories)
          .map((memory) => `- [${memory.category}] ${memory.content}`)
          .join('\n')}`
      );
    }

    return parts.filter(Boolean).join('\n\n');
  }
}

export async function createLLM(opts = {}) {
  const engine = new LLMEngine(opts);
  await engine.init(opts.vaultPassword);
  return engine;
}

export async function ask(prompt, opts = {}) {
  const engine = await createLLM(opts);
  return engine.complete(prompt, opts);
}

export { PROVIDERS };
