import { fetchJSON } from '../utils/fetch.js';
import fetch from 'node-fetch';
import { getServiceURL, getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// Oracle lives under acp.darksol.net/api/oracle/
// Endpoints: health (free), coin/dice/number/shuffle (x402 — $0.05 USDC on Base)
const getURL = () => {
  const custom = getServiceURL('oracle');
  if (custom) return custom;
  return 'https://acp.darksol.net/api/oracle';
};

function handleX402(response) {
  if (response === 402 || (response && response.status === 402)) {
    warn('Oracle requires x402 payment ($0.05 USDC on Base)');
    info('Use with agent signer: darksol signer start → requests auto-pay');
    info('Or pay manually via facilitator: darksol facilitator');
    return true;
  }
  return false;
}

async function oracleRequest(path, opts = {}) {
  const url = `${getURL()}${path}`;
  const resp = await fetch(url, opts);

  if (resp.status === 402) {
    // Return x402 info so caller can handle
    const paymentHeader = resp.headers.get('payment-required');
    let paymentInfo = null;
    if (paymentHeader) {
      try {
        paymentInfo = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      } catch {}
    }
    return { x402: true, paymentInfo, status: 402 };
  }

  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    throw new Error(`Oracle returned non-JSON response (${resp.status})`);
  }
  return await resp.json();
}

export async function oracleHealth() {
  const spin = spinner('Checking oracle...').start();
  try {
    const data = await oracleRequest('/health');
    if (data.x402) {
      spin.succeed('Oracle online (health should be free)');
      return;
    }
    spin.succeed('Oracle online');

    showSection('ORACLE STATUS');
    kvDisplay([
      ['Status', data.status === 'ok' ? theme.success('● Online') : theme.error('○ ' + data.status)],
      ['Contract', data.contract || '-'],
      ['Chain', data.chain || 'base'],
      ['Block', String(data.blockNumber || '-')],
    ]);
    console.log('');
    info('Endpoints require x402 payment ($0.05 USDC on Base)');
    info('Games: coin flip, dice, random number, shuffle');
    info('Docs: https://acp.darksol.net/oracle');
  } catch (err) {
    spin.fail('Oracle unreachable');
    error(err.message);
  }
}

export async function oracleFlip() {
  const spin = spinner('Flipping coin...').start();
  try {
    const data = await oracleRequest('/coin');
    if (data.x402) {
      spin.info('Payment required');
      handleX402(data);
      if (data.paymentInfo) {
        const accepts = data.paymentInfo.accepts?.[0];
        if (accepts) {
          kvDisplay([
            ['Amount', `$${(parseInt(accepts.amount) / 1e6).toFixed(2)} USDC`],
            ['Network', 'Base'],
            ['Pay To', accepts.payTo || '-'],
          ]);
        }
      }
      return;
    }
    spin.succeed('Coin flipped');
    showSection('ORACLE — COIN FLIP');
    kvDisplay([
      ['Result', theme.gold.bold(data.result || data.value)],
      ['Proof', data.proof || data.txHash || 'N/A'],
    ]);
  } catch (err) {
    spin.fail('Oracle failed');
    error(err.message);
  }
}

export async function oracleDice(sides = 6) {
  const spin = spinner(`Rolling d${sides}...`).start();
  try {
    const data = await oracleRequest(`/dice?sides=${sides}`);
    if (data.x402) {
      spin.info('Payment required');
      handleX402(data);
      return;
    }
    spin.succeed('Dice rolled');
    showSection(`ORACLE — D${sides}`);
    kvDisplay([
      ['Result', theme.gold.bold(data.result || data.value)],
      ['Sides', sides.toString()],
      ['Proof', data.proof || data.txHash || 'N/A'],
    ]);
  } catch (err) {
    spin.fail('Oracle failed');
    error(err.message);
  }
}

export async function oracleNumber(min = 1, max = 100) {
  const spin = spinner(`Generating number ${min}-${max}...`).start();
  try {
    const data = await oracleRequest(`/number?min=${min}&max=${max}`);
    if (data.x402) {
      spin.info('Payment required');
      handleX402(data);
      return;
    }
    spin.succeed('Number generated');
    showSection('ORACLE — RANDOM NUMBER');
    kvDisplay([
      ['Result', theme.gold.bold(data.result || data.value)],
      ['Range', `${min} — ${max}`],
      ['Proof', data.proof || data.txHash || 'N/A'],
    ]);
  } catch (err) {
    spin.fail('Oracle failed');
    error(err.message);
  }
}

export async function oracleShuffle(items) {
  const spin = spinner('Shuffling...').start();
  try {
    const data = await oracleRequest('/shuffle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (data.x402) {
      spin.info('Payment required');
      handleX402(data);
      return;
    }
    spin.succeed('Shuffled');
    showSection('ORACLE — SHUFFLE');
    console.log(theme.gold('  Result: ') + (data.result || data.value || []).join(', '));
  } catch (err) {
    spin.fail('Oracle failed');
    error(err.message);
  }
}
