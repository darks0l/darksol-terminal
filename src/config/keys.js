import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir, hostname, userInfo } from 'os';
import { theme } from '../ui/theme.js';
import { kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import inquirer from 'inquirer';

const KEYS_DIR = join(homedir(), '.darksol', 'keys');
const KEYS_FILE = join(KEYS_DIR, 'vault.json');
const ALGORITHM = 'aes-256-gcm';
const SCRYPT_N = 2 ** 16;  // lighter for keys (faster unlock)
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_MAXMEM = 512 * 1024 * 1024;

function ensureDir() {
  if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });
}

function encrypt(value, password) {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: SCRYPT_MAXMEM });
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted,
  };
}

function decrypt(entry, password) {
  const key = scryptSync(password, Buffer.from(entry.salt, 'hex'), 32, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: SCRYPT_MAXMEM });
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(entry.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(entry.tag, 'hex'));
  let decrypted = decipher.update(entry.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function loadVault() {
  ensureDir();
  if (!existsSync(KEYS_FILE)) return { version: 1, keys: {} };
  return JSON.parse(readFileSync(KEYS_FILE, 'utf8'));
}

function saveVault(vault) {
  ensureDir();
  writeFileSync(KEYS_FILE, JSON.stringify(vault, null, 2));
}

// ──────────────────────────────────────────────────
// SUPPORTED API SERVICES
// ──────────────────────────────────────────────────

export const SERVICES = {
  // LLM Providers
  openai: {
    name: 'OpenAI',
    category: 'llm',
    description: 'GPT-4o, GPT-5 — natural language trading, strategy advisor',
    envVar: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    validate: (key) => key.startsWith('sk-'),
  },
  anthropic: {
    name: 'Anthropic',
    category: 'llm',
    description: 'Claude Opus, Sonnet — intent parsing, analysis',
    envVar: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    validate: (key) => key.startsWith('sk-ant-'),
  },
  openrouter: {
    name: 'OpenRouter',
    category: 'llm',
    description: 'Multi-model gateway — any LLM via one key',
    envVar: 'OPENROUTER_API_KEY',
    docsUrl: 'https://openrouter.ai/keys',
    validate: (key) => key.startsWith('sk-or-'),
  },
  minimax: {
    name: 'MiniMax',
    category: 'llm',
    description: 'MiniMax-M2.5 via OpenAI-compatible chat completions',
    envVar: 'MINIMAX_API_KEY',
    docsUrl: 'https://platform.minimax.io/docs/guides/models-intro',
    validate: (key) => key.length > 10,
  },
  nvidia: {
    name: 'NVIDIA NIM',
    category: 'llm',
    description: 'NVIDIA NIM — Llama, Nemotron, Mistral via build.nvidia.com',
    envVar: 'NVIDIA_API_KEY',
    docsUrl: 'https://build.nvidia.com',
    validate: (key) => key.startsWith('nvapi-') || key.length > 10,
  },
  ollama: {
    name: 'Ollama (Local)',
    category: 'llm',
    description: 'Local models — free, private, no API key needed',
    envVar: 'OLLAMA_HOST',
    docsUrl: 'https://ollama.ai',
    validate: (key) => key.startsWith('http'),
  },
  bankr: {
    name: 'Bankr LLM Gateway',
    category: 'llm',
    description: 'Multi-model gateway — Claude, Gemini, GPT via crypto credits',
    envVar: 'BANKR_LLM_KEY',
    docsUrl: 'https://docs.bankr.bot/llm-gateway/overview',
    validate: (key) => key.startsWith('bk_'),
  },

  // Data Providers
  coingecko: {
    name: 'CoinGecko Pro',
    category: 'data',
    description: 'Pro/Demo API — higher rate limits, more endpoints',
    envVar: 'COINGECKO_API_KEY',
    docsUrl: 'https://www.coingecko.com/en/api/pricing',
    validate: (key) => key.length > 10,
  },
  dexscreener: {
    name: 'DexScreener',
    category: 'data',
    description: 'Enhanced DEX data — paid tier for higher limits',
    envVar: 'DEXSCREENER_API_KEY',
    docsUrl: 'https://docs.dexscreener.com',
    validate: (key) => key.length > 10,
  },
  etherscan: {
    name: 'Etherscan',
    category: 'data',
    description: 'Explorer APIs — Etherscan, Basescan, Arbiscan, Polygonscan',
    envVar: 'ETHERSCAN_API_KEY',
    docsUrl: 'https://etherscan.io/apis',
    validate: (key) => key.length > 10,
  },
  defillama: {
    name: 'DefiLlama',
    category: 'data',
    description: 'TVL, yield, protocol data — free, no key needed',
    envVar: null,
    docsUrl: 'https://defillama.com/docs/api',
    validate: () => true,
  },

  // RPC Providers (OAuth/API key)
  alchemy: {
    name: 'Alchemy',
    category: 'rpc',
    description: 'Premium RPC — faster, more reliable, trace APIs',
    envVar: 'ALCHEMY_API_KEY',
    docsUrl: 'https://dashboard.alchemy.com',
    validate: (key) => key.length > 10,
  },
  infura: {
    name: 'Infura',
    category: 'rpc',
    description: 'RPC provider — Ethereum, Polygon, Arbitrum, Optimism',
    envVar: 'INFURA_API_KEY',
    docsUrl: 'https://app.infura.io',
    validate: (key) => key.length > 10,
  },
  quicknode: {
    name: 'QuickNode',
    category: 'rpc',
    description: 'High-performance RPC — WebSocket support, trace',
    envVar: 'QUICKNODE_API_KEY',
    docsUrl: 'https://dashboard.quicknode.com',
    validate: (key) => key.length > 10,
  },

  // Trading & Auth
  oneinch: {
    name: '1inch',
    category: 'trading',
    description: 'DEX aggregator API — best swap routing',
    envVar: 'ONEINCH_API_KEY',
    docsUrl: 'https://portal.1inch.dev',
    validate: (key) => key.length > 10,
  },
  agentmail: {
    name: 'AgentMail',
    category: 'email',
    description: 'Email for AI agents — create inboxes, send/receive',
    envVar: 'AGENTMAIL_API_KEY',
    docsUrl: 'https://console.agentmail.to',
    validate: (key) => key.startsWith('am_'),
  },

  // Messaging
  telegram: {
    name: 'Telegram Bot',
    category: 'messaging',
    description: 'Telegram bot token — AI chat via Telegram',
    envVar: 'TELEGRAM_BOT_TOKEN',
    docsUrl: 'https://core.telegram.org/bots#botfather',
    validate: (key) => /^\d+:.+$/.test(key),
  },
  paraswap: {
    name: 'ParaSwap',
    category: 'trading',
    description: 'DEX aggregator — competitive routing',
    envVar: 'PARASWAP_API_KEY',
    docsUrl: 'https://developers.paraswap.network',
    validate: (key) => key.length > 5,
  },
  lifi: {
    name: 'LI.FI',
    category: 'trading',
    description: 'Cross-chain swaps & bridges — 58 chains, 27 bridges, 31 DEXs',
    envVar: 'LIFI_API_KEY',
    docsUrl: 'https://docs.li.fi/api-reference/rate-limits',
    validate: (key) => key.length > 20,
  },
};

// ──────────────────────────────────────────────────
// KEY MANAGEMENT
// ──────────────────────────────────────────────────

/**
 * Add or update an API key
 */
export async function addKey(service, opts = {}) {
  const svc = SERVICES[service];
  if (!svc) {
    error(`Unknown service: ${service}. Run: darksol keys list`);
    return;
  }

  let apiKey = opts.key;
  if (!apiKey) {
    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: theme.gold(`${svc.name} API key:`),
      mask: '●',
      validate: (v) => {
        if (!v) return 'Key required';
        if (svc.validate && !svc.validate(v)) return `Invalid format for ${svc.name}`;
        return true;
      },
    }]);
    apiKey = key;
  }

  // Get vault password
  let vaultPass = opts.password;
  if (!vaultPass) {
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password', // nosec
      message: theme.gold('Vault password:'),
      mask: '●',
      validate: (v) => v.length >= 6 || 'Minimum 6 characters',
    }]);
    vaultPass = password;
  }

  const vault = loadVault();
  vault.keys[service] = {
    encrypted: encrypt(apiKey, vaultPass),
    service: svc.name,
    category: svc.category,
    addedAt: new Date().toISOString(),
  };
  saveVault(vault);

  success(`${svc.name} key stored securely`);
  if (svc.envVar) {
    info(`Also available via env: ${svc.envVar}`);
  }
}

/**
 * Get a decrypted API key
 */
export async function getKey(service, password) {
  const vault = loadVault();
  const entry = vault.keys[service];

  if (!entry) {
    // Fall back to environment variable
    const svc = SERVICES[service];
    if (svc?.envVar && process.env[svc.envVar]) {
      return process.env[svc.envVar];
    }
    return null;
  }

  try {
    return decrypt(entry.encrypted, password);
  } catch {
    return null;
  }
}

/**
 * Get a key without password (tries env var first, then cached session)
 */
export function getKeyFromEnv(service) {
  const svc = SERVICES[service];
  if (svc?.envVar && process.env[svc.envVar]) {
    return process.env[svc.envVar];
  }
  return null;
}

/**
 * Get an API key without prompting.
 * Prefers auto-stored keys, then environment variables.
 */
export function getApiKey(service) {
  return getKeyAuto(service) || getKeyFromEnv(service);
}

/**
 * Remove a key
 */
export async function removeKey(service) {
  const vault = loadVault();
  if (!vault.keys[service]) {
    error(`No key stored for: ${service}`);
    return;
  }
  const svc = SERVICES[service];
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: theme.accent(`Remove ${svc?.name || service} key?`),
    default: false,
  }]);
  if (!confirm) return;

  delete vault.keys[service];
  saveVault(vault);
  success(`${svc?.name || service} key removed`);
}

/**
 * List all services and stored keys
 */
export function listKeys() {
  const vault = loadVault();

  showSection('API KEY VAULT');

  const categories = ['llm', 'data', 'rpc', 'trading', 'email', 'messaging'];
  const catNames = { llm: '🧠 LLM PROVIDERS', data: '📊 DATA PROVIDERS', rpc: '🌐 RPC PROVIDERS', trading: '📈 TRADING', email: '📧 EMAIL', messaging: '💬 MESSAGING' };

  for (const cat of categories) {
    console.log('');
    console.log(theme.gold(`  ${catNames[cat]}`));

    const services = Object.entries(SERVICES).filter(([, s]) => s.category === cat);
    for (const [key, svc] of services) {
      const stored = vault.keys[key];
      const envKey = svc.envVar ? getKeyFromEnv(key) : null;
      let status;

      if (stored) {
        status = theme.success('● Stored');
      } else if (envKey) {
        status = theme.info('● Env');
      } else {
        status = theme.dim('○ Not set');
      }

      console.log(`    ${status} ${theme.label(svc.name.padEnd(18))} ${theme.dim(svc.description)}`);
    }
  }

  console.log('');
  info('Add a key: darksol keys add <service>');
  info('Services: ' + Object.keys(SERVICES).join(', '));
}

/**
 * Add a key directly (non-interactive, for setup wizard / OAuth)
 * Uses a machine-derived vault password for seamless storage
 */
export function addKeyDirect(service, apiKey) {
  const vaultPass = getMachineVaultPass();
  const vault = loadVault();
  const svc = SERVICES[service];
  vault.keys[service] = {
    encrypted: encrypt(apiKey, vaultPass),
    service: svc?.name || service,
    category: svc?.category || 'custom',
    addedAt: new Date().toISOString(),
    autoStored: true,  // flag: stored via wizard, not manual password
  };
  saveVault(vault);
}

/**
 * Get a key stored via addKeyDirect (auto-stored, machine password)
 */
export function getKeyAuto(service) {
  const vault = loadVault();
  const entry = vault.keys[service];
  if (!entry) return getKeyFromEnv(service);
  if (!entry.autoStored) return getKeyFromEnv(service);  // manual entries need password
  try {
    return decrypt(entry.encrypted, getMachineVaultPass());
  } catch {
    return getKeyFromEnv(service);
  }
}

/**
 * Check if a VALID key exists for a service (stored or env)
 * Actually validates format, not just existence
 */
export function hasKey(service) {
  const svc = SERVICES[service];
  const vault = loadVault();

  // Check vault (auto-stored keys)
  if (vault.keys[service]) {
    // If auto-stored, try to decrypt and validate
    if (vault.keys[service].autoStored) {
      try {
        const key = decrypt(vault.keys[service].encrypted, getMachineVaultPass());
        if (svc?.validate && !svc.validate(key)) return false;
        return true;
      } catch { return false; }
    }
    return true;  // manually stored keys are assumed valid
  }

  // Check environment variable
  if (svc?.envVar && process.env[svc.envVar]) {
    const envVal = process.env[svc.envVar];
    // For Ollama, just having OLLAMA_HOST doesn't mean AI is ready
    // — we need actual LLM providers with API keys
    if (service === 'ollama') {
      // Ollama is "ready" if host is set and looks like a URL
      return envVal.startsWith('http') && envVal.length > 10;
    }
    // For API key services, validate the key format
    if (svc.validate) {
      return svc.validate(envVal);
    }
    return envVal.length > 0;
  }

  return false;
}

/**
 * Quick check: is any LLM provider properly configured?
 * Only returns true if a real API key is validated
 */
export function hasAnyLLM() {
  // Cloud providers — need real validated API keys
  if (['openai', 'anthropic', 'openrouter', 'minimax', 'nvidia', 'bankr'].some(s => hasKey(s))) return true;
  // Ollama — check if explicitly configured via hasKey (validates URL format)
  if (hasKey('ollama')) return true;
  return false;
}

/**
 * Machine-derived vault password for auto-stored keys
 * (derived from hostname + username — not high security, but protects at rest)
 */
function getMachineVaultPass() {
  return `darksol-vault-${hostname()}-${userInfo().username}`;
}

export { KEYS_DIR, KEYS_FILE };

