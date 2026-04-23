import fetch from 'node-fetch';
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from 'crypto';

/**
 * x402 Payment Flow
 *
 * When a server returns 402 with a `payment-required` header (base64-encoded JSON),
 * this utility:
 *   1. Decodes the payment requirement
 *   2. Signs an EIP-3009 transferWithAuthorization via:
 *      a. Local crypto signing (no external deps) — preferred
 *      b. Agent signer at 127.0.0.1:18790 — legacy fallback
 *   3. Retries the original request with the signed payment in the `X-PAYMENT` header
 */

const SIGNER_URL = 'http://127.0.0.1:18790';

// USDC contract details for EIP-3009
const USDC_CONTRACTS = {
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
  137:   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon
  1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
  10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
};

/**
 * Parse the payment-required header (base64 JSON)
 */
function parsePaymentRequired(header) {
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString());
  } catch {
    return null;
  }
}

/**
 * Check if agent signer is running
 */
async function isSignerRunning(token) {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await fetch(`${SIGNER_URL}/health`, { headers, timeout: 2000 });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Get signer address
 */
async function getSignerAddress(token) {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await fetch(`${SIGNER_URL}/address`, { headers, timeout: 2000 });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.address;
  } catch {
    return null;
  }
}

/**
 * Sign EIP-712 typed data for x402 payment (EIP-3009 transferWithAuthorization)
 */
async function signX402Payment(paymentReq, signerToken) {
  const accepts = paymentReq.accepts?.[0];
  if (!accepts) throw new Error('No payment scheme in x402 requirement');

  // Parse network — format is "eip155:<chainId>"
  const chainId = parseInt(accepts.network?.split(':')[1] || '8453');
  const usdcAddress = accepts.asset || USDC_CONTRACTS[chainId];
  const amount = accepts.amount; // in smallest unit (e.g., 50000 = $0.05 USDC)
  const payTo = accepts.payTo;
  const deadline = Math.floor(Date.now() / 1000) + (accepts.maxTimeoutSeconds || 300);

  // Get our address
  const fromAddress = await getSignerAddress(signerToken);
  if (!fromAddress) throw new Error('Cannot get signer address');

  // Generate random nonce (32 bytes)
  const nonce = '0x' + [...Array(32)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

  // EIP-712 domain for USDC
  const domain = {
    name: accepts.extra?.name || 'USD Coin',
    version: accepts.extra?.version || '2',
    chainId: chainId,
    verifyingContract: usdcAddress,
  };

  // EIP-3009 TransferWithAuthorization types
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  const value = {
    from: fromAddress,
    to: payTo,
    value: amount,
    validAfter: '0',
    validBefore: String(deadline),
    nonce: nonce,
  };

  // Sign via agent signer
  const headers = { 'Content-Type': 'application/json' };
  if (signerToken) headers.Authorization = `Bearer ${signerToken}`;

  const resp = await fetch(`${SIGNER_URL}/sign-typed-data`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ domain, types, value }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Signer refused: ${err}`);
  }

  const result = await resp.json();

  // Build the x402 payment payload
  return {
    x402Version: paymentReq.x402Version || 2,
    scheme: 'exact',
    network: accepts.network || `eip155:${chainId}`,
    payload: {
      signature: result.signature,
      authorization: {
        from: fromAddress,
        to: payTo,
        value: amount,
        validAfter: '0',
        validBefore: String(deadline),
        nonce: nonce,
      },
    },
  };
}

/**
 * Make an x402-aware fetch request.
 *
 * If the server returns 402, this will:
 * 1. Parse the payment requirement
 * 2. Sign the payment via agent signer
 * 3. Retry with the X-PAYMENT header
 *
 * @param {string} url - Request URL
 * @param {object} opts - fetch options
 * @param {object} x402Opts - { signerToken, autoSign }
 * @returns {object} { data, paid, paymentInfo }
 */
export async function fetchWithX402(url, opts = {}, x402Opts = {}) {
  const { signerToken, autoSign = true } = x402Opts;

  // First attempt
  const resp = await fetch(url, opts);

  if (resp.status !== 402) {
    // Normal response
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      const text = await resp.text();
      throw new Error(`Non-JSON response (${resp.status}): ${text.substring(0, 100)}`);
    }
    return { data: await resp.json(), paid: false };
  }

  // 402 — payment required
  const paymentHeader = resp.headers.get('payment-required');
  if (!paymentHeader) {
    throw new Error('402 but no payment-required header');
  }

  const paymentReq = parsePaymentRequired(paymentHeader);
  if (!paymentReq) {
    throw new Error('Failed to parse payment-required header');
  }

  if (!autoSign) {
    return { data: null, paid: false, x402: true, paymentInfo: paymentReq };
  }

  // Check if signer is running
  const signerUp = await isSignerRunning(signerToken);
  if (!signerUp) {
    return {
      data: null,
      paid: false,
      x402: true,
      paymentInfo: paymentReq,
      error: 'Agent signer not running. Start it: darksol signer start',
    };
  }

  // Sign the payment
  const payment = await signX402Payment(paymentReq, signerToken);

  // Retry with payment
  const retryOpts = { ...opts };
  retryOpts.headers = {
    ...(opts.headers || {}),
    'X-PAYMENT': Buffer.from(JSON.stringify(payment)).toString('base64'),
  };

  const retryResp = await fetch(url, retryOpts);
  const ct = retryResp.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    const text = await retryResp.text();
    throw new Error(`Paid but got non-JSON (${retryResp.status}): ${text.substring(0, 100)}`);
  }

  if (!retryResp.ok) {
    const errData = await retryResp.json().catch(() => ({}));
    throw new Error(`Payment sent but request failed (${retryResp.status}): ${JSON.stringify(errData)}`);
  }

  return { data: await retryResp.json(), paid: true, paymentInfo: paymentReq };
}

// ============================================================================
// Local Crypto Signing (no external signer needed)
// Adapted from Claude Code's x402 client — pure Node.js crypto
// ============================================================================

const CHAIN_IDS = { 8453: 'base', 84532: 'base-sepolia', 1: 'ethereum', 11155111: 'ethereum-sepolia', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism' };

/**
 * EIP-55 mixed-case checksum address.
 * @param {string} address - Raw hex address
 * @returns {string} Checksummed address
 */
function toChecksumAddress(address) {
  const addr = address.toLowerCase().replace('0x', '');
  const hash = createHash('sha3-256').update(addr).digest('hex');
  let checksummed = '0x';
  for (let i = 0; i < addr.length; i++) {
    checksummed += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return checksummed;
}

/**
 * Derive an Ethereum address from a private key using secp256k1.
 * @param {string} privateKeyHex - Private key (with or without 0x prefix)
 * @returns {string} EIP-55 checksummed address
 */
export function deriveAddress(privateKeyHex) {
  const keyHex = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const keyBuffer = Buffer.from(keyHex, 'hex');

  const derPrefix = Buffer.from('30740201010420', 'hex');
  const derMiddle = Buffer.from('a00706052b8104000aa144034200', 'hex');

  const privateKey = createPrivateKey({
    key: Buffer.concat([derPrefix, keyBuffer, derMiddle]),
    format: 'der',
    type: 'sec1',
  });

  const publicKey = createPublicKey(privateKey);
  const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const uncompressedPubKey = pubKeyDer.subarray(pubKeyDer.length - 65);

  const hash = createHash('sha3-256').update(uncompressedPubKey.subarray(1)).digest();
  const rawAddress = '0x' + hash.subarray(hash.length - 20).toString('hex');
  return toChecksumAddress(rawAddress);
}

/**
 * Sign x402 payment locally using Node.js crypto (no agent signer needed).
 * Uses EIP-3009 transferWithAuthorization via EIP-712 typed data.
 *
 * @param {object} paymentReq - Parsed payment requirement (from 402 response)
 * @param {string} privateKeyHex - Private key (hex, with or without 0x)
 * @returns {object} x402 payment payload ready to base64-encode
 */
export function signX402PaymentLocal(paymentReq, privateKeyHex) {
  const accepts = paymentReq.accepts?.[0];
  if (!accepts) throw new Error('No payment scheme in x402 requirement');

  const chainId = parseInt(accepts.network?.split(':')[1] || '8453');
  const usdcAddress = accepts.asset || USDC_CONTRACTS[chainId];
  const amount = accepts.amount;
  const payTo = accepts.payTo;
  const deadline = Math.floor(Date.now() / 1000) + (accepts.maxTimeoutSeconds || 300);
  const fromAddress = deriveAddress(privateKeyHex);
  const nonce = '0x' + randomBytes(32).toString('hex');

  const domain = {
    name: accepts.extra?.name || 'USD Coin',
    version: accepts.extra?.version || '2',
    chainId,
    verifyingContract: usdcAddress,
  };

  const authorization = {
    from: fromAddress,
    to: payTo,
    value: String(amount),
    validAfter: '0',
    validBefore: String(deadline),
    nonce,
  };

  // Compute EIP-712 domain separator
  const domainTypeHash = createHash('sha3-256')
    .update('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    .digest();
  const nameHash = createHash('sha3-256').update(domain.name).digest();
  const versionHash = createHash('sha3-256').update(domain.version).digest();

  const domainEncoded = Buffer.alloc(5 * 32);
  domainTypeHash.copy(domainEncoded, 0);
  nameHash.copy(domainEncoded, 32);
  versionHash.copy(domainEncoded, 64);
  const chainIdBuf = Buffer.alloc(32);
  chainIdBuf.writeBigUInt64BE(BigInt(domain.chainId), 24);
  chainIdBuf.copy(domainEncoded, 96);
  const addrBuf = Buffer.alloc(32);
  Buffer.from(domain.verifyingContract.replace('0x', ''), 'hex').copy(addrBuf, 12);
  addrBuf.copy(domainEncoded, 128);
  const domainSeparator = createHash('sha3-256').update(domainEncoded).digest();

  // Compute struct hash for TransferWithAuthorization
  const structTypeHash = createHash('sha3-256')
    .update('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
    .digest();

  const structEncoded = Buffer.alloc(7 * 32);
  structTypeHash.copy(structEncoded, 0);

  const fromBuf = Buffer.alloc(32);
  Buffer.from(authorization.from.replace('0x', ''), 'hex').copy(fromBuf, 12);
  fromBuf.copy(structEncoded, 32);

  const toBuf = Buffer.alloc(32);
  Buffer.from(authorization.to.replace('0x', ''), 'hex').copy(toBuf, 12);
  toBuf.copy(structEncoded, 64);

  const valueBuf = Buffer.alloc(32);
  const value = BigInt(authorization.value);
  valueBuf.writeBigUInt64BE(value >> 192n, 0);
  valueBuf.writeBigUInt64BE((value >> 128n) & 0xffffffffffffffffn, 8);
  valueBuf.writeBigUInt64BE((value >> 64n) & 0xffffffffffffffffn, 16);
  valueBuf.writeBigUInt64BE(value & 0xffffffffffffffffn, 24);
  valueBuf.copy(structEncoded, 96);

  const validAfterBuf = Buffer.alloc(32);
  validAfterBuf.writeBigUInt64BE(BigInt(authorization.validAfter), 24);
  validAfterBuf.copy(structEncoded, 128);

  const validBeforeBuf = Buffer.alloc(32);
  validBeforeBuf.writeBigUInt64BE(BigInt(authorization.validBefore), 24);
  validBeforeBuf.copy(structEncoded, 160);

  const nonceBuf = Buffer.from(authorization.nonce.replace('0x', ''), 'hex');
  const noncePadded = Buffer.alloc(32);
  nonceBuf.copy(noncePadded, 32 - nonceBuf.length);
  noncePadded.copy(structEncoded, 192);

  const structHash = createHash('sha3-256').update(structEncoded).digest();

  // EIP-712 signing hash
  const prefix = Buffer.from('1901', 'hex');
  const message = createHash('sha3-256')
    .update(Buffer.concat([prefix, domainSeparator, structHash]))
    .digest();

  // Sign with secp256k1
  const keyHex = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const derPrefix = Buffer.from('30740201010420', 'hex');
  const derMiddle = Buffer.from('a00706052b8104000aa144034200', 'hex');
  const ecPrivateKey = createPrivateKey({
    key: Buffer.concat([derPrefix, Buffer.from(keyHex, 'hex'), derMiddle]),
    format: 'der',
    type: 'sec1',
  });

  const signature = sign(null, message, { key: ecPrivateKey, dsaEncoding: 'ieee-p1363' });
  const r = signature.subarray(0, 32);
  const s = signature.subarray(32, 64);
  const sigHex = '0x' + r.toString('hex') + s.toString('hex') + '1b'; // v=27

  return {
    x402Version: paymentReq.x402Version || 2,
    scheme: 'exact',
    network: accepts.network || `eip155:${chainId}`,
    payload: {
      signature: sigHex,
      authorization,
    },
  };
}

/**
 * Wrap any fetch function with automatic x402 payment handling.
 * When a 402 is received, signs and retries transparently.
 *
 * @param {Function} fetchFn - fetch function to wrap
 * @param {object} config - { privateKey, maxPaymentUsd?, onPayment? }
 * @returns {Function} Wrapped fetch function
 */
export function wrapFetchWithX402(fetchFn, config) {
  return async (url, opts = {}) => {
    const response = await fetchFn(url, opts);
    if (response.status !== 402) return response;

    const paymentHeader = response.headers.get('payment-required') || response.headers.get('x-payment-required');
    if (!paymentHeader) return response;

    const paymentReq = parsePaymentRequired(paymentHeader);
    if (!paymentReq) return response;

    const accepts = paymentReq.accepts?.[0];
    if (!accepts) return response;

    // Check payment limit
    const amountUsd = parseInt(accepts.amount || '0') / 1_000_000;
    if (config.maxPaymentUsd && amountUsd > config.maxPaymentUsd) {
      console.log(`[x402] Payment of $${amountUsd.toFixed(4)} exceeds limit of $${config.maxPaymentUsd}`);
      return response;
    }

    const payment = signX402PaymentLocal(paymentReq, config.privateKey);

    config.onPayment?.({ url, amountUsd, payTo: accepts.payTo, network: accepts.network });

    const retryOpts = { ...opts };
    retryOpts.headers = {
      ...(opts.headers || {}),
      'X-PAYMENT': Buffer.from(JSON.stringify(payment)).toString('base64'),
    };

    return fetchFn(url, retryOpts);
  };
}

export { parsePaymentRequired, isSignerRunning, getSignerAddress, signX402Payment };
