import inquirer from 'inquirer';
import { theme } from '../ui/theme.js';
import { showSection, showDivider } from '../ui/banner.js';
import { success, error, warn, info, kvDisplay } from '../ui/components.js';
import { getConfig, setConfig } from '../config/store.js';
import { addKeyDirect, hasKey, SERVICES } from '../config/keys.js';
import { createServer } from 'http';
import open from 'open';
import crypto from 'crypto';

// ══════════════════════════════════════════════════
// FIRST-RUN SETUP WIZARD
// ══════════════════════════════════════════════════

/**
 * Check if this is a first run (no LLM keys configured)
 */
export function isFirstRun() {
  const hasAnyLLM = ['openai', 'anthropic', 'openrouter', 'ollama'].some(s => hasKey(s));
  const setupDone = getConfig('setupComplete');
  return !hasAnyLLM && !setupDone;
}

/**
 * Run the setup wizard
 */
export async function runSetupWizard(opts = {}) {
  const force = opts.force || false;

  if (!force && !isFirstRun()) {
    info('Setup already complete. Use --force to re-run.');
    return;
  }

  console.log('');
  showSection('🌑 DARKSOL TERMINAL — FIRST RUN SETUP');
  console.log('');
  console.log(theme.dim('  Welcome to DARKSOL Terminal. Let\'s get you set up.'));
  console.log(theme.dim('  You need an LLM provider to use the AI trading assistant.'));
  console.log(theme.dim('  Everything else works without one.'));
  console.log('');

  showDivider();

  // Step 1: Choose LLM provider
  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: theme.gold('Choose your AI provider:'),
    choices: [
      { name: '🤖 OpenAI (GPT-4o, GPT-5) — API key or OAuth', value: 'openai' },
      { name: '🧠 Anthropic (Claude Opus, Sonnet) — API key or OAuth', value: 'anthropic' },
      { name: '🔀 OpenRouter (any model, one key) — API key', value: 'openrouter' },
      { name: '🏠 Ollama (local models, free, private) — no key needed', value: 'ollama' },
      { name: '⏭️  Skip for now', value: 'skip' },
    ],
  }]);

  if (provider === 'skip') {
    warn('Skipped LLM setup. You can set up later with: darksol setup');
    setConfig('setupComplete', true);
    showPostSetup();
    return;
  }

  if (provider === 'ollama') {
    await setupOllama();
  } else {
    await setupCloudProvider(provider);
  }

  // Step 2: Chain selection
  console.log('');
  const { chain } = await inquirer.prompt([{
    type: 'list',
    name: 'chain',
    message: theme.gold('Default chain:'),
    choices: [
      { name: 'Base (recommended — low fees, fast)', value: 'base' },
      { name: 'Ethereum (mainnet)', value: 'ethereum' },
      { name: 'Arbitrum', value: 'arbitrum' },
      { name: 'Optimism', value: 'optimism' },
      { name: 'Polygon', value: 'polygon' },
    ],
    default: 'base',
  }]);
  setConfig('chain', chain);
  success(`Chain set to ${chain}`);

  // Step 3: Wallet
  console.log('');
  const { createWallet } = await inquirer.prompt([{
    type: 'confirm',
    name: 'createWallet',
    message: theme.gold('Create a wallet now?'),
    default: true,
  }]);

  if (createWallet) {
    const { createNewWallet } = await import('../wallet/manager.js');
    await createNewWallet();
  } else {
    info('Create one later: darksol wallet create <name>');
  }

  setConfig('setupComplete', true);
  showPostSetup();
}

/**
 * Setup a cloud provider (OpenAI, Anthropic, OpenRouter)
 */
async function setupCloudProvider(provider) {
  const supportsOAuth = ['openai', 'anthropic'].includes(provider);
  const providerName = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    openrouter: 'OpenRouter',
  }[provider];

  if (supportsOAuth) {
    const { method } = await inquirer.prompt([{
      type: 'list',
      name: 'method',
      message: theme.gold(`How do you want to connect ${providerName}?`),
      choices: [
        { name: `🔑 API Key — paste your ${providerName} API key`, value: 'apikey' },
        { name: `🌐 OAuth — sign in with your ${providerName} account`, value: 'oauth' },
        { name: `📋 Instructions — show me how to get a key`, value: 'help' },
      ],
    }]);

    if (method === 'apikey') {
      await setupAPIKey(provider);
    } else if (method === 'oauth') {
      await startOAuth(provider);
    } else {
      showKeyInstructions(provider);
      // After showing instructions, ask for key
      await setupAPIKey(provider);
    }
  } else {
    await setupAPIKey(provider);
  }
}

/**
 * Setup via API key entry
 */
async function setupAPIKey(provider) {
  const providerName = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    openrouter: 'OpenRouter',
  }[provider];

  const { key } = await inquirer.prompt([{
    type: 'password',
    name: 'key',
    message: theme.gold(`${providerName} API key:`),
    mask: '●',
    validate: (v) => {
      if (!v || v.length < 10) return 'Key seems too short';
      return true;
    },
  }]);

  addKeyDirect(provider, key);
  success(`${providerName} key saved (encrypted)`);

  // Set as default provider
  setConfig('llmProvider', provider);
  info(`Default AI provider set to ${provider}`);
}

/**
 * Setup Ollama (local)
 */
async function setupOllama() {
  console.log('');
  console.log(theme.gold('  OLLAMA SETUP'));
  console.log(theme.dim('  Ollama runs models locally — free, private, no API key needed.'));
  console.log('');

  const { host } = await inquirer.prompt([{
    type: 'input',
    name: 'host',
    message: theme.gold('Ollama host:'),
    default: 'http://localhost:11434',
  }]);

  setConfig('ollamaHost', host);

  const { model } = await inquirer.prompt([{
    type: 'input',
    name: 'model',
    message: theme.gold('Default model:'),
    default: 'llama3',
  }]);

  setConfig('ollamaModel', model);
  setConfig('llmProvider', 'ollama');

  success(`Ollama configured: ${host} / ${model}`);
  info('Make sure Ollama is running: ollama serve');
}

/**
 * Show instructions for getting API keys
 */
function showKeyInstructions(provider) {
  console.log('');

  if (provider === 'openai') {
    showSection('GET AN OPENAI API KEY');
    console.log(theme.dim('  1. Go to https://platform.openai.com/api-keys'));
    console.log(theme.dim('  2. Click "Create new secret key"'));
    console.log(theme.dim('  3. Copy the key (starts with sk-)'));
    console.log(theme.dim('  4. Paste it below'));
    console.log('');
    console.log(theme.dim('  💡 If you have a ChatGPT Plus/Pro subscription,'));
    console.log(theme.dim('     you can use OAuth instead (sign in with your account).'));
  } else if (provider === 'anthropic') {
    showSection('GET AN ANTHROPIC API KEY');
    console.log(theme.dim('  1. Go to https://console.anthropic.com/settings/keys'));
    console.log(theme.dim('  2. Click "Create Key"'));
    console.log(theme.dim('  3. Copy the key (starts with sk-ant-)'));
    console.log(theme.dim('  4. Paste it below'));
    console.log('');
    console.log(theme.dim('  💡 If you have a Claude Pro/Team subscription,'));
    console.log(theme.dim('     you can use OAuth instead.'));
  }

  console.log('');
}

// ══════════════════════════════════════════════════
// OAuth FLOWS
// ══════════════════════════════════════════════════

// OAuth configurations
const OAUTH_CONFIGS = {
  openai: {
    name: 'OpenAI',
    authUrl: 'https://auth.openai.com/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    // These are placeholder client IDs — users need to register their own app
    // or use the direct API key flow
    clientId: null,
    scopes: ['openid', 'profile'],
    helpUrl: 'https://platform.openai.com/docs/guides/authentication',
  },
  anthropic: {
    name: 'Anthropic',
    authUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    clientId: null,
    scopes: ['api'],
    helpUrl: 'https://docs.anthropic.com/en/docs/authentication',
  },
};

/**
 * Start OAuth flow for a provider
 */
async function startOAuth(provider) {
  const config = OAUTH_CONFIGS[provider];

  // Check if provider has public OAuth available
  // As of 2026, OpenAI and Anthropic have limited OAuth — API keys are more common
  console.log('');
  showSection(`${config.name} OAuth`);
  console.log('');
  console.log(theme.dim('  OAuth lets you sign in with your existing subscription'));
  console.log(theme.dim('  without creating a separate API key.'));
  console.log('');

  // Check for custom client ID (user may have registered an OAuth app)
  const storedClientId = getConfig(`oauth_${provider}_clientId`);

  if (!storedClientId && !config.clientId) {
    // No OAuth app registered — offer alternatives
    console.log(theme.accent('  ⚠️  OAuth requires a registered application.'));
    console.log('');
    console.log(theme.dim('  Options:'));
    console.log(theme.dim(`  1. Register an OAuth app at ${config.helpUrl}`));
    console.log(theme.dim('  2. Use an API key instead (faster, simpler)'));
    console.log('');

    const { oauthChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'oauthChoice',
      message: theme.gold('How to proceed?'),
      choices: [
        { name: '🔑 Use API key instead (recommended)', value: 'apikey' },
        { name: '📝 Enter my OAuth client ID', value: 'clientid' },
        { name: '🌐 Open registration page in browser', value: 'register' },
      ],
    }]);

    if (oauthChoice === 'apikey') {
      await setupAPIKey(provider);
      return;
    }

    if (oauthChoice === 'register') {
      try {
        await open(config.helpUrl);
        info(`Opened ${config.helpUrl} in your browser`);
      } catch {
        info(`Go to: ${config.helpUrl}`);
      }
      console.log('');
      const { hasClientId } = await inquirer.prompt([{
        type: 'confirm',
        name: 'hasClientId',
        message: theme.gold('Do you have a client ID now?'),
        default: false,
      }]);
      if (!hasClientId) {
        info('No problem — use an API key for now.');
        await setupAPIKey(provider);
        return;
      }
    }

    // Get client ID from user
    const { clientId } = await inquirer.prompt([{
      type: 'input',
      name: 'clientId',
      message: theme.gold('OAuth Client ID:'),
      validate: (v) => v.length > 5 || 'Client ID seems too short',
    }]);

    const { clientSecret } = await inquirer.prompt([{
      type: 'password',
      name: 'clientSecret',
      message: theme.gold('OAuth Client Secret:'),
      mask: '●',
    }]);

    setConfig(`oauth_${provider}_clientId`, clientId);
    if (clientSecret) {
      addKeyDirect(`${provider}_oauth_secret`, clientSecret);
    }

    await executeOAuthFlow(provider, clientId, clientSecret);
  } else {
    const clientId = storedClientId || config.clientId;
    const clientSecret = getKey(`${provider}_oauth_secret`);
    await executeOAuthFlow(provider, clientId, clientSecret);
  }
}

/**
 * Execute the OAuth authorization code flow
 */
async function executeOAuthFlow(provider, clientId, clientSecret) {
  const config = OAUTH_CONFIGS[provider];
  const port = 19876; // Local callback port
  const redirectUri = `http://localhost:${port}/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  // Build auth URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${config.authUrl}?${params}`;

  // Start local server to receive callback
  return new Promise(async (resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const err = url.searchParams.get('error');

        if (err) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>❌ Authorization failed</h2><p>You can close this window.</p></body></html>');
          error(`OAuth error: ${err}`);
          server.close();
          resolve(false);
          return;
        }

        if (returnedState !== state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>❌ State mismatch</h2><p>Possible CSRF. You can close this window.</p></body></html>');
          error('OAuth state mismatch — possible security issue');
          server.close();
          resolve(false);
          return;
        }

        // Exchange code for token
        try {
          const fetch = (await import('node-fetch')).default;
          const tokenResp = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              client_id: clientId,
              ...(clientSecret ? { client_secret: clientSecret } : {}),
              code_verifier: codeVerifier,
            }),
          });

          const tokenData = await tokenResp.json();

          if (tokenData.access_token) {
            // Store the token as the API key
            addKeyDirect(provider, tokenData.access_token);
            if (tokenData.refresh_token) {
              addKeyDirect(`${provider}_refresh`, tokenData.refresh_token);
            }
            setConfig('llmProvider', provider);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<html><body style="background:#1a1a2e;color:#d4a574;font-family:monospace;text-align:center;padding:60px"><h2>✅ DARKSOL Terminal — Connected to ${config.name}</h2><p>You can close this window.</p></body></html>`);

            success(`${config.name} connected via OAuth`);
            info(`Token stored (encrypted). Provider set to ${provider}.`);
          } else {
            throw new Error(tokenData.error || 'No access token in response');
          }
        } catch (tokenErr) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>❌ Token exchange failed</h2><p>You can close this window.</p></body></html>');
          error(`Token exchange failed: ${tokenErr.message}`);
          info('Try using an API key instead: darksol keys add ' + provider);
        }

        server.close();
        resolve(true);
      }
    });

    server.listen(port, '127.0.0.1', async () => {
      console.log('');
      info(`Opening ${config.name} authorization page...`);
      console.log(theme.dim(`  If browser doesn't open, go to:`));
      console.log(theme.accent(`  ${authUrl}`));
      console.log('');
      info('Waiting for authorization...');

      try {
        await open(authUrl);
      } catch {
        warn('Could not open browser automatically');
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      warn('OAuth timed out (5 minutes)');
      server.close();
      resolve(false);
    }, 300000);
  });
}

// ══════════════════════════════════════════════════
// POST-SETUP & HELPERS
// ══════════════════════════════════════════════════

function showPostSetup() {
  console.log('');
  showSection('🌑 YOU\'RE READY');
  console.log('');
  console.log(theme.gold('  Next steps:'));
  console.log(theme.dim('  • darksol ai chat          Start the AI trading assistant'));
  console.log(theme.dim('  • darksol market top        See what\'s moving'));
  console.log(theme.dim('  • darksol wallet create     Create an encrypted wallet'));
  console.log(theme.dim('  • darksol tips              Trading tips & tricks'));
  console.log(theme.dim('  • darksol quickstart        Full getting started guide'));
  console.log('');
  console.log(theme.dim('  Re-run setup anytime: darksol setup --force'));
  console.log('');
}

/**
 * Quick check on startup — if first run, prompt setup
 */
export async function checkFirstRun() {
  if (isFirstRun()) {
    console.log('');
    warn('No AI provider configured yet.');
    const { runSetup } = await inquirer.prompt([{
      type: 'confirm',
      name: 'runSetup',
      message: theme.gold('Run setup wizard?'),
      default: true,
    }]);
    if (runSetup) {
      await runSetupWizard();
      return true;
    }
    info('Skip for now. Run later: darksol setup');
  }
  return false;
}
