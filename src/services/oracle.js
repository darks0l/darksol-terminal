import { fetchJSON } from '../utils/fetch.js';
import fetch from 'node-fetch';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('oracle') || 'https://acp.darksol.net/oracle';

export async function oracleFlip() {
  const spin = spinner('Flipping coin...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/coin`);
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
    const data = await fetchJSON(`${getURL()}/api/dice?sides=${sides}`);
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
    const data = await fetchJSON(`${getURL()}/api/number?min=${min}&max=${max}`);
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
    const data = await fetchJSON(`${getURL()}/api/shuffle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    spin.succeed('Shuffled');
    showSection('ORACLE — SHUFFLE');
    console.log(theme.gold('  Result: ') + (data.result || data.value || []).join(', '));
  } catch (err) {
    spin.fail('Oracle failed');
    error(err.message);
  }
}

export async function oracleHealth() {
  const spin = spinner('Checking oracle...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/health`);
    spin.succeed('Oracle online');
    showSection('ORACLE STATUS');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Oracle unreachable');
    error(err.message);
  }
}
