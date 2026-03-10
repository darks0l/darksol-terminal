import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// Facilitator root returns service info (no /api/health path)
const getURL = () => getServiceURL('facilitator') || 'https://facilitator.darksol.net';

export async function facilitatorHealth() {
  const spin = spinner('Checking facilitator...').start();
  try {
    const data = await fetchJSON(`${getURL()}/`);
    spin.succeed('Facilitator online');

    showSection('x402 FACILITATOR');
    kvDisplay([
      ['Service', data.service || 'DARKSOL Facilitator'],
      ['Version', data.version || '-'],
      ['Protocol', data.protocol || 'x402'],
      ['Fee', data.fee || '0%'],
      ['Chains', Array.isArray(data.chains) ? data.chains.join(', ') : (data.chains || 'Base, Polygon')],
      ['Status', theme.success('● Online')],
    ]);
    if (data.description) {
      console.log('');
      console.log(theme.dim(`  ${data.description}`));
    }
    if (data.contracts) {
      console.log('');
      for (const [chain, addr] of Object.entries(data.contracts)) {
        console.log(`  ${theme.gold(chain.padEnd(10))} ${theme.dim(addr)}`);
      }
    }
    console.log('');
    info('Docs: https://acp.darksol.net/facilitator');
  } catch (err) {
    spin.fail('Facilitator unreachable');
    error(err.message);
    info('Check: https://facilitator.darksol.net');
  }
}

export async function facilitatorVerify(payment) {
  const spin = spinner('Verifying payment...').start();
  try {
    const data = await fetchJSON(`${getURL()}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(typeof payment === 'string' ? JSON.parse(payment) : payment),
    });
    spin.succeed(data.valid ? 'Payment valid' : 'Payment invalid');

    showSection('PAYMENT VERIFICATION');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Verification failed');
    error(err.message);
  }
}

export async function facilitatorSettle(payment) {
  const spin = spinner('Settling on-chain...').start();
  try {
    const data = await fetchJSON(`${getURL()}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(typeof payment === 'string' ? JSON.parse(payment) : payment),
    });
    spin.succeed('Settlement complete');

    showSection('SETTLEMENT');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    spin.fail('Settlement failed');
    error(err.message);
  }
}
