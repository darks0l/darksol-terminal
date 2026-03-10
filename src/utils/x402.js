import fetch from 'node-fetch';

/**
 * x402 Payment Flow
 *
 * When a server returns 402 with a `payment-required` header (base64-encoded JSON),
 * this utility:
 *   1. Decodes the payment requirement
 *   2. Signs an EIP-3009 transferWithAuthorization via the local agent signer
 *   3. Retries the original request with the signed payment in the `X-PAYMENT` header
 *
 * Requires: agent signer running at 127.0.0.1:18790
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

export { parsePaymentRequired, isSignerRunning, getSignerAddress, signX402Payment };
