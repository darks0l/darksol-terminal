/**
 * Token Estimation & Cost Prediction
 * Adapted from Claude Code patterns for DARKSOL Terminal
 *
 * Offline token estimation -- no API calls needed.
 * Use before sending requests to predict cost and avoid budget overruns.
 */

// ============================================================================
// Constants
// ============================================================================

/** Default bytes-per-token ratio for general text */
const DEFAULT_BYTES_PER_TOKEN = 4;

/** JSON has many single-char tokens ({, }, :, ,, ") -- ratio closer to 2 */
const JSON_BYTES_PER_TOKEN = 2;

/** Fixed token cost for images/documents regardless of format */
const IMAGE_TOKEN_SIZE = 2000;

// ============================================================================
// Pricing (per million tokens)
// ============================================================================

const PRICING = {
  // OpenAI
  'gpt-5.2-pro':    { input: 21, output: 168 },
  'gpt-5.2':        { input: 1.75, output: 14 },
  'gpt-5':          { input: 1.25, output: 10 },
  'gpt-5-mini':     { input: 0.25, output: 2 },
  'gpt-5-nano':     { input: 0.05, output: 0.4 },
  'gpt-4o':         { input: 2.5, output: 10 },
  'gpt-4o-mini':    { input: 0.15, output: 0.6 },
  'gpt-4-turbo':    { input: 10, output: 30 },
  'gpt-4.1':        { input: 3, output: 12 },
  'gpt-4.1-mini':   { input: 0.8, output: 3.2 },
  'gpt-4.1-nano':   { input: 0.2, output: 0.8 },

  // Anthropic
  'claude-opus-4-6':   { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-5':   { input: 5, output: 25 },
  'claude-haiku-4-5':  { input: 1, output: 5 },
  'claude-3.5-sonnet': { input: 3, output: 15 },
  'claude-3.5-haiku':  { input: 0.8, output: 4 },
  'claude-3-haiku':    { input: 0.25, output: 1.25 },

  // Google
  'gemini-2.5-pro':        { input: 1.25, output: 10 },
  'gemini-2.5-flash':      { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash':      { input: 0.1, output: 0.4 },

  // DeepSeek
  'deepseek-chat':     { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },

  // MiniMax
  'minimax-m2.5': { input: 0.5, output: 1.8 },

  // NVIDIA NIM (varies by model)
  'llama-3.3-70b-instruct': { input: 0.3, output: 0.3 },

  // Local (free)
  'ollama': { input: 0, output: 0 },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Rough token count from text content.
 * @param {string} content - Text to estimate
 * @param {number} [bytesPerToken=4] - Chars per token ratio
 * @returns {number} Estimated token count
 */
export function roughTokenCount(content, bytesPerToken = DEFAULT_BYTES_PER_TOKEN) {
  if (!content) return 0;
  return Math.round(content.length / bytesPerToken);
}

/**
 * Get bytes-per-token ratio for a file type.
 * JSON/JSONL use ratio of 2 (many single-char tokens).
 * @param {string} ext - File extension (without dot)
 * @returns {number}
 */
export function bytesPerTokenForFileType(ext) {
  switch (ext?.toLowerCase()) {
    case 'json':
    case 'jsonl':
    case 'jsonc':
      return JSON_BYTES_PER_TOKEN;
    default:
      return DEFAULT_BYTES_PER_TOKEN;
  }
}

/**
 * Estimate tokens for a file, using file-type-aware ratio.
 * @param {string} content - File content
 * @param {string} [ext] - File extension
 * @returns {number}
 */
export function estimateFileTokens(content, ext) {
  return roughTokenCount(content, bytesPerTokenForFileType(ext));
}

/**
 * Estimate token count for conversation messages.
 * Uses 4/3 conservative padding since we're approximating.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
export function estimateMessageTokens(messages) {
  if (!messages?.length) return 0;

  let total = 0;
  for (const msg of messages) {
    if (msg.content) {
      total += roughTokenCount(String(msg.content));
    }
  }

  // Pad by 4/3 to be conservative
  return Math.ceil(total * (4 / 3));
}

/**
 * Estimate USD cost for a model call.
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {string} model - Model name (partial match supported)
 * @returns {{ costUsd: number, model: string, found: boolean }}
 */
export function estimateCost(inputTokens, outputTokens, model) {
  const pricing = findPricing(model);
  if (!pricing) {
    return { costUsd: 0, model, found: false };
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return {
    costUsd: inputCost + outputCost,
    model,
    found: true,
  };
}

/**
 * Find pricing for a model (supports partial/fuzzy matching).
 * @param {string} model
 * @returns {{ input: number, output: number } | null}
 */
function findPricing(model) {
  if (!model) return null;
  const lower = model.toLowerCase();

  // Direct match
  if (PRICING[lower]) return PRICING[lower];

  // Partial match (e.g., "gpt-4o" matches "gpt-4o")
  for (const [key, value] of Object.entries(PRICING)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }

  // Provider-level fallback
  if (lower.includes('ollama') || lower.includes('lfm2') || lower.includes('qwen')) {
    return { input: 0, output: 0 };
  }

  return null;
}

/**
 * Pre-call budget check: estimate cost and check against limit.
 * @param {string} content - Prompt/message content
 * @param {string} model - Model name
 * @param {number} [budgetUsd] - Budget limit in USD
 * @param {number} [expectedOutputTokens=1000] - Expected output tokens
 * @returns {{ estimatedInputTokens: number, estimatedCostUsd: number, withinBudget: boolean }}
 */
export function checkBudget(content, model, budgetUsd, expectedOutputTokens = 1000) {
  const inputTokens = roughTokenCount(content);
  const { costUsd, found } = estimateCost(inputTokens, expectedOutputTokens, model);

  return {
    estimatedInputTokens: inputTokens,
    estimatedCostUsd: costUsd,
    withinBudget: budgetUsd == null || costUsd <= budgetUsd,
    pricingFound: found,
  };
}

export { PRICING, DEFAULT_BYTES_PER_TOKEN, JSON_BYTES_PER_TOKEN, IMAGE_TOKEN_SIZE };
