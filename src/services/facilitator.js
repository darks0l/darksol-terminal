import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

const getURL = () => getServiceURL('facilitator') || 'https://facilitator.darksol.net';

export async function facilitatorHealth() {
  const spin = spinner('Checking facilitator...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/health`);
    spin.succeed('Facilitator online');

    showSection('FACILITATOR STATUS');
    kvDisplay(Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  } catch (err) {
    spin.fail('Facilitator unreachable');
    error(err.message);
  }
}

export async function facilitatorVerify(payment) {
  const spin = spinner('Verifying payment...').start();
  try {
    const data = await fetchJSON(`${getURL()}/api/verify`, {
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
    const data = await fetchJSON(`${getURL()}/api/settle`, {
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
