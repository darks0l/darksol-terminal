import { fetchJSON } from '../utils/fetch.js';
import { fetchWithX402, isSignerRunning } from '../utils/x402.js';
import { getServiceURL, getConfig } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, warn, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// Oracle lives at acp.darksol.net/api/oracle/
// Health is free; game endpoints are x402-gated ($0.05 USDC on Base)
const getURL = () => getServiceURL('oracle') || 'https://acp.darksol.net/api/oracle';

function getSignerToken() {
  return process.env.DARKSOL_SIGNER_TOKEN || getConfig('signerToken') || null;
}

export async function oracleHealth() {
  const spin = spinner('Checking oracle...').start();
  try {
    const data = await fetchJSON(`${getURL()}/health`);
    spin.succeed('Oracle online');

    showSection('RANDOM ORACLE 🎲');
    kvDisplay([
      ['Status', data.status === 'ok' ? theme.success('● Online') : theme.error('○ ' + data.status)],
      ['Contract', data.contract || '-'],
      ['Chain', data.chain || 'base'],
      ['Block', String(data.blockNumber || '-')],
    ]);

    // Check signer status
    const signerUp = await isSignerRunning(getSignerToken());
    console.log('');
    if (signerUp) {
      console.log(`  ${theme.success('●')} Agent signer running — x402 auto-pay enabled`);
    } else {
      console.log(`  ${theme.dim('○')} Agent signer not running — start for auto-pay: ${theme.gold('darksol agent start <wallet-name>')}`);
    }

    console.log('');
    info('Games: coin flip, dice, random number, shuffle ($0.05 USDC each)');
    info('Docs: https://acp.darksol.net/oracle');
  } catch (err) {
    spin.fail('Oracle unreachable');
    error(err.message);
  }
}

async function oraclePlay(endpoint, label, displayFn) {
  const spin = spinner(`${label}...`).start();
  const token = getSignerToken();

  try {
    const result = await fetchWithX402(`${getURL()}${endpoint}`, {}, { signerToken: token });

    if (result.x402 && !result.paid) {
      // Payment required but couldn't auto-pay
      spin.info('x402 payment required');
      const accepts = result.paymentInfo?.accepts?.[0];
      if (accepts) {
        warn(`Cost: $${(parseInt(accepts.amount) / 1e6).toFixed(2)} USDC on Base`);
      }
      if (result.error) {
        info(result.error);
      } else {
        info('Start agent signer for auto-pay: darksol agent start <wallet-name>');
      }
      return null;
    }

    if (result.paid) {
      spin.succeed(`${label} ✓ (paid $0.05 USDC)`);
    } else {
      spin.succeed(label);
    }

    displayFn(result.data);
    return result.data;
  } catch (err) {
    spin.fail(`${label} failed`);
    error(err.message);
    return null;
  }
}

export async function oracleFlip() {
  return oraclePlay('/coin', 'Coin flip', (data) => {
    showSection('ORACLE — COIN FLIP 🪙');
    kvDisplay([
      ['Result', theme.gold.bold(data.result || data.value || '-')],
      ['Proof', data.proof || data.txHash || '-'],
    ]);
  });
}

export async function oracleDice(sides = 6) {
  return oraclePlay(`/dice?sides=${sides}`, `Rolling d${sides}`, (data) => {
    showSection(`ORACLE — D${sides} 🎲`);
    kvDisplay([
      ['Result', theme.gold.bold(data.result || data.value || '-')],
      ['Sides', sides.toString()],
      ['Proof', data.proof || data.txHash || '-'],
    ]);
  });
}

export async function oracleNumber(min = 1, max = 100) {
  return oraclePlay(`/number?min=${min}&max=${max}`, `Number ${min}-${max}`, (data) => {
    showSection('ORACLE — RANDOM NUMBER 🔢');
    kvDisplay([
      ['Result', theme.gold.bold(data.result || data.value || '-')],
      ['Range', `${min} — ${max}`],
      ['Proof', data.proof || data.txHash || '-'],
    ]);
  });
}

export async function oracleShuffle(items) {
  return oraclePlay('/shuffle', 'Shuffling', (data) => {
    showSection('ORACLE — SHUFFLE 🔀');
    const result = data.result || data.value || [];
    console.log(theme.gold('  Result: ') + (Array.isArray(result) ? result.join(', ') : result));
    if (data.proof || data.txHash) {
      console.log(theme.dim(`  Proof: ${data.proof || data.txHash}`));
    }
  });
}
