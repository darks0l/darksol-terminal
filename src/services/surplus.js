import fetch from 'node-fetch';
import { Wallet, TypedDataEncoder } from 'ethers';
import { getConfig } from '../config/store.js';
import { getKeyAuto, getKeyFromEnv, addKeyDirect } from '../config/keys.js';
import { loadWallet, decryptKey } from '../wallet/keystore.js';
import { spinner, table, kvDisplay, success, error, info, warn } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const SURPLUS_BASE_URL = 'https://www.surplusintelligence.ai';
const SURPLUS_INFERENCE_URL = `${SURPLUS_BASE_URL}/api/inference/v1`;

function getSurplusApiKey() {
  return getKeyAuto('surplus') || getKeyFromEnv('surplus') || process.env.SURPLUS_API_KEY || null;
}

function getAuthHeaders() {
  const key = getSurplusApiKey();
  if (!key) {
    throw new Error('No Surplus API key configured. Run: darksol keys add surplus <inf_...> or use darksol surplus buyer auth');
  }
  return { Authorization: `Bearer ${key}` };
}

async function fetchJson(path, opts = {}) {
  const response = await fetch(`${SURPLUS_BASE_URL}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error || data?.message || data?.detail || text || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function formatNumber(value, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '-');
  return num.toFixed(digits);
}

export async function surplusModels(opts = {}) {
  const spin = spinner('Fetching Surplus models...').start();
  try {
    const data = await fetchJson('/api/inference/v1/models', {
      headers: getAuthHeaders(),
    });
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    spin.succeed(`Loaded ${models.length} models`);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('SURPLUS MODELS');
    if (!models.length) {
      warn('No models returned');
      console.log('');
      return data;
    }

    const rows = models.slice(0, opts.limit || 25).map((model) => [
      model.id || model.model || '-',
      model.owned_by || model.provider || '-',
      model.object || '-',
    ]);
    table(['Model', 'Provider', 'Type'], rows);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Failed to load models');
    error(err.message);
    return null;
  }
}

export async function surplusMarkets(opts = {}) {
  const spin = spinner('Fetching Surplus markets...').start();
  try {
    const data = await fetchJson('/api/inference/markets', {
      headers: getAuthHeaders(),
    });
    const markets = Array.isArray(data?.markets) ? data.markets : Array.isArray(data?.data) ? data.data : [];
    spin.succeed(`Loaded ${markets.length} markets`);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('SURPLUS MARKETS');
    if (!markets.length) {
      warn('No markets returned');
      console.log('');
      return data;
    }

    const rows = markets.slice(0, opts.limit || 25).map((market) => [
      market.model || market.id || '-',
      market.best_price || market.price || market.unit_price || '-',
      market.seller_count || market.sellers || '-',
      market.provider || '-',
    ]);
    table(['Model', 'Best Price', 'Sellers', 'Provider'], rows);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Failed to load markets');
    error(err.message);
    return null;
  }
}

export async function surplusBuyerStatus(opts = {}) {
  const spin = spinner('Fetching Surplus buyer status...').start();
  try {
    const data = await fetchJson('/api/inference/buyers/me', {
      headers: getAuthHeaders(),
    });
    spin.succeed('Buyer status loaded');

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('SURPLUS BUYER');
    kvDisplay(Object.entries({
      address: data.address || data.wallet || '-',
      wallet: data.wallet_address || '-',
      balance: data.balance ?? data.credits ?? '-',
      status: data.status || '-',
      buyerId: data.id || data.buyer_id || '-',
    }).map(([k, v]) => [k, String(v)]));
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Failed to load buyer status');
    error(err.message);
    return null;
  }
}

export async function surplusBuyerProviders(opts = {}) {
  const spin = spinner('Fetching Surplus priority providers...').start();
  try {
    const data = await fetchJson('/api/inference/buyers/providers', {
      headers: getAuthHeaders(),
    });
    const providers = Array.isArray(data?.providers) ? data.providers : Array.isArray(data?.data) ? data.data : [];
    spin.succeed(`Loaded ${providers.length} providers`);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('SURPLUS PRIORITY PROVIDERS');
    if (!providers.length) {
      warn('No buyer priority providers configured');
      console.log('');
      return data;
    }

    const rows = providers.map((provider) => [
      provider.model || '-',
      provider.base_url || provider.baseUrl || '-',
      provider.status || '-',
      provider.priority || '-',
    ]);
    table(['Model', 'Base URL', 'Status', 'Priority'], rows);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Failed to load providers');
    error(err.message);
    return null;
  }
}

export async function surplusBuyerAddProvider(opts = {}) {
  const { model, baseUrl, providerKey } = opts;
  if (!model || !baseUrl || !providerKey) {
    throw new Error('Usage: darksol surplus buyer add-provider --model <model> --base-url <url> --provider-key <key>');
  }

  const spin = spinner('Adding Surplus priority provider...').start();
  try {
    const data = await fetchJson('/api/inference/buyers/providers', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model,
        base_url: baseUrl,
        api_key: providerKey,
      }),
    });
    spin.succeed('Priority provider added');
    success(`Added priority provider for ${model}`);
    return data;
  } catch (err) {
    spin.fail('Failed to add provider');
    error(err.message);
    return null;
  }
}

export async function surplusSellerOffers(opts = {}) {
  const spin = spinner('Fetching seller offers...').start();
  try {
    const data = await fetchJson('/api/inference/sellers/offers', {
      headers: getAuthHeaders(),
    });
    const offers = Array.isArray(data?.offers) ? data.offers : Array.isArray(data?.data) ? data.data : [];
    spin.succeed(`Loaded ${offers.length} offers`);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return data;
    }

    showSection('SURPLUS SELLER OFFERS');
    if (!offers.length) {
      warn('No seller offers found');
      console.log('');
      return data;
    }

    const rows = offers.map((offer) => [
      offer.model || '-',
      offer.seller_base_url || offer.base_url || '-',
      offer.price || offer.unit_price || '-',
      offer.status || '-',
    ]);
    table(['Model', 'Base URL', 'Price', 'Status'], rows);
    console.log('');
    return data;
  } catch (err) {
    spin.fail('Failed to load offers');
    error(err.message);
    return null;
  }
}

export async function surplusSellerCreateOffer(opts = {}) {
  const { model, sellerBaseUrl, providerKey, price } = opts;
  if (!model || !sellerBaseUrl || !providerKey) {
    throw new Error('Usage: darksol surplus seller add-offer --model <model> --seller-base-url <url> --provider-key <key> [--price <number>]');
  }

  const spin = spinner('Creating seller offer...').start();
  try {
    const body = {
      model,
      api_key: providerKey,
      seller_base_url: sellerBaseUrl,
    };
    if (price !== undefined) body.price = Number(price);

    const data = await fetchJson('/api/inference/sellers/offers', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    spin.succeed('Seller offer created');
    success(`Seller offer created for ${model}`);
    return data;
  } catch (err) {
    spin.fail('Failed to create offer');
    error(err.message);
    return null;
  }
}

async function buildSiweMessage({ domain, address, statement, uri, version, chainId, nonce, issuedAt }) {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nURI: ${uri}\nVersion: ${version}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

async function signSurplusChallenge({ walletName, password, side = 'buyers' }) {
  const name = walletName || getConfig('activeWallet');
  if (!name) {
    throw new Error('No active wallet. Use: darksol wallet use <name>');
  }

  const walletData = loadWallet(name);
  const privateKey = decryptKey(walletData.keystore, password);
  const wallet = new Wallet(privateKey);
  const challenge = await fetchJson(`/api/inference/${side}/auth/challenge?address=${wallet.address}`);

  const payload = challenge.challenge || challenge;
  const message = payload.message || await buildSiweMessage({
    domain: payload.domain || 'www.surplusintelligence.ai',
    address: wallet.address,
    statement: payload.statement || `Sign in to Surplus Intelligence ${side}`,
    uri: payload.uri || SURPLUS_BASE_URL,
    version: payload.version || '1',
    chainId: payload.chainId || 8453,
    nonce: payload.nonce,
    issuedAt: payload.issuedAt || new Date().toISOString(),
  });

  const signature = await wallet.signMessage(message);
  return { wallet, message, signature, challenge: payload };
}

export async function surplusBuyerAuth(opts = {}) {
  const { wallet, password } = opts;
  const spin = spinner('Creating Surplus buyer API key...').start();
  try {
    const signed = await signSurplusChallenge({ walletName: wallet, password, side: 'buyers' });
    const data = await fetchJson('/api/inference/buyers/auth/key', {
      method: 'POST',
      body: JSON.stringify({
        address: signed.wallet.address,
        message: signed.message,
        signature: signed.signature,
      }),
    });
    const key = data.api_key || data.key || data.token;
    if (!key) throw new Error('Surplus did not return an API key');
    addKeyDirect('surplus', key);
    spin.succeed('Surplus buyer API key created');
    success(`Stored Surplus buyer key for ${signed.wallet.address}`);
    info('You can now use --provider surplus or darksol config model --provider surplus <model>');
    return data;
  } catch (err) {
    spin.fail('Failed to create buyer key');
    error(err.message);
    return null;
  }
}

export async function surplusSellerAuth(opts = {}) {
  const { wallet, password } = opts;
  const spin = spinner('Creating Surplus seller API key...').start();
  try {
    const signed = await signSurplusChallenge({ walletName: wallet, password, side: 'sellers' });
    const data = await fetchJson('/api/inference/sellers/auth/key', {
      method: 'POST',
      body: JSON.stringify({
        address: signed.wallet.address,
        message: signed.message,
        signature: signed.signature,
      }),
    });
    spin.succeed('Surplus seller API key created');
    success(`Seller auth completed for ${signed.wallet.address}`);
    if (opts.storeAsDefault && (data.api_key || data.key || data.token)) {
      addKeyDirect('surplus', data.api_key || data.key || data.token);
      info('Stored returned seller token in surplus key slot');
    }
    return data;
  } catch (err) {
    spin.fail('Failed to create seller key');
    error(err.message);
    return null;
  }
}

