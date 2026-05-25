import { getConfig } from '../config/store.js';

export const MODEL_CATALOG = {
  openai: {
    defaultModel: 'gpt-5.4',
    choices: [
      { value: 'gpt-5.4', label: 'gpt-5.4', desc: 'flagship, complex reasoning' },
      { value: 'gpt-5-mini', label: 'gpt-5-mini', desc: 'fast, lower cost' },
      { value: 'gpt-4o', label: 'gpt-4o', desc: 'previous gen, still good' },
      { value: 'o3', label: 'o3', desc: 'reasoning model' },
    ],
  },
  anthropic: {
    defaultModel: 'claude-sonnet-4-6',
    choices: [
      { value: 'claude-opus-4-6', label: 'claude-opus-4-6', desc: 'most intelligent, agents+coding' },
      { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6', desc: 'best speed/intelligence balance' },
      { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5', desc: 'fastest, near-frontier' },
    ],
  },
  openrouter: {
    defaultModel: 'anthropic/claude-sonnet-4-6',
    choices: [
      { value: 'anthropic/claude-sonnet-4-6', label: 'anthropic/claude-sonnet-4-6', desc: 'popular pick' },
      { value: 'openai/gpt-5.4', label: 'openai/gpt-5.4', desc: 'popular pick' },
      { value: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro', desc: 'popular pick' },
      { value: 'meta-llama/llama-4-maverick', label: 'meta-llama/llama-4-maverick', desc: 'popular pick' },
      { value: 'deepseek/deepseek-r1', label: 'deepseek/deepseek-r1', desc: 'popular pick' },
    ],
    allowCustom: true,
  },
  minimax: {
    defaultModel: 'MiniMax-M2.5',
    choices: [
      { value: 'MiniMax-M2.5', label: 'MiniMax-M2.5', desc: 'flagship, 204K context, ~60 tps' },
      { value: 'MiniMax-M2.5-highspeed', label: 'MiniMax-M2.5-highspeed', desc: 'same perf, ~100 tps' },
      { value: 'MiniMax-M2.1', label: 'MiniMax-M2.1', desc: 'code-focused' },
      { value: 'MiniMax-M2.1-highspeed', label: 'MiniMax-M2.1-highspeed', desc: 'code-focused, faster' },
      { value: 'MiniMax-M2', label: 'MiniMax-M2', desc: 'agentic, advanced reasoning' },
    ],
  },
  nvidia: {
    defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    choices: [
      { value: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B', desc: 'high reasoning + tool calling' },
      { value: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', desc: 'fast, free tier friendly' },
      { value: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', desc: 'strong general purpose' },
      { value: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2', desc: 'multilingual, coding' },
      { value: 'nvidia/nemotron-mini-4b-instruct', label: 'Nemotron Mini 4B', desc: 'ultra-fast, lightweight' },
    ],
  },
  ollama: {
    defaultModel: 'llama3.1',
    textInput: true,
  },
  bankr: {
    defaultModel: 'claude-sonnet-4.6',
    managed: true,
  },
  surplus: {
    defaultModel: 'llama-3.3-70b',
    choices: [
      { value: 'llama-3.3-70b', label: 'llama-3.3-70b', desc: 'popular marketplace model' },
      { value: 'llama-3.1-70b', label: 'llama-3.1-70b', desc: 'strong open model option' },
      { value: 'claude-opus-4.6', label: 'claude-opus-4.6', desc: 'seller-routed premium model' },
      { value: 'claude-sonnet-4.6', label: 'claude-sonnet-4.6', desc: 'balanced premium model' },
      { value: 'gpt-5.4', label: 'gpt-5.4', desc: 'OpenAI-routed marketplace option' },
      { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro', desc: 'Google-class marketplace option' },
    ],
    allowCustom: true,
  },
};

export function getProviderDefaultModel(provider) {
  return MODEL_CATALOG[provider]?.defaultModel || null;
}

export function getConfiguredProvider(fallback = 'openai') {
  return getConfig('llm.provider') || fallback;
}

export function getConfiguredModel(provider = getConfiguredProvider()) {
  const configured = getConfig('llm.model');
  return configured || getProviderDefaultModel(provider);
}

export function getModelSelectionMeta(provider = getConfiguredProvider()) {
  return MODEL_CATALOG[provider] || { defaultModel: null };
}
