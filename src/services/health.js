import fetch from 'node-fetch';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, success, error, info, table } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

// Service definitions — each has a name, URL resolver, and endpoint to ping
const SERVICES = [
  {
    name: 'Facilitator',
    url: () => (getServiceURL('facilitator') || 'https://facilitator.darksol.net') + '/',
    desc: 'x402 payment facilitator',
  },
  {
    name: 'Casino',
    url: () => (getServiceURL('casino') || 'https://casino.darksol.net') + '/api/stats',
    desc: 'On-chain casino',
  },
  {
    name: 'Oracle',
    url: () => (getServiceURL('oracle') || 'https://acp.darksol.net/api/oracle') + '/health',
    desc: 'Random oracle (x402)',
  },
  {
    name: 'Cards',
    url: () => (getServiceURL('cards') || 'https://acp.darksol.net') + '/api/cards/catalog',
    desc: 'Prepaid crypto cards',
  },
  {
    name: 'Wiretap',
    url: () => (getServiceURL('aim') || 'https://acp.darksol.net') + '/api/aim/health',
    desc: 'AIM / Wiretap agent messaging',
  },
  {
    name: 'ThreatLab',
    url: () => (getServiceURL('miroshark') || 'http://127.0.0.1:5001') + '/api/templates/list',
    desc: 'MiroShark swarm simulation backend',
  },
  {
    name: 'LI.FI',
    url: () => 'https://li.quest/v1/status',
    desc: 'Cross-chain swaps & bridges',
  },
  {
    name: 'Agent Signer',
    url: () => 'http://127.0.0.1:18790/status',
    desc: 'Local signing proxy',
  },
];

const TIMEOUT_MS = 5000;

/**
 * Ping a single service endpoint.
 * Returns { name, url, status: 'up'|'down'|'timeout', responseMs, error? }
 */
async function pingService(service) {
  const url = service.url();
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const responseMs = Date.now() - start;

    if (resp.ok || resp.status < 500) {
      return { name: service.name, url, status: 'up', responseMs, desc: service.desc };
    }
    return { name: service.name, url, status: 'down', responseMs, desc: service.desc, error: `HTTP ${resp.status}` };
  } catch (err) {
    const responseMs = Date.now() - start;
    if (err.name === 'AbortError') {
      return { name: service.name, url, status: 'timeout', responseMs, desc: service.desc, error: 'Timed out' };
    }
    // Connection refused, DNS failure, etc.
    const msg = err.code === 'ECONNREFUSED' ? 'Connection refused' : (err.message || 'Unknown error');
    return { name: service.name, url, status: 'down', responseMs, desc: service.desc, error: msg };
  }
}

/**
 * Check health of all configured services.
 * Returns array of results.
 */
export async function checkHealth() {
  return Promise.all(SERVICES.map(s => pingService(s)));
}

/**
 * CLI handler — check all services and display results.
 */
export async function healthCommand(opts = {}) {
  const json = opts.json || false;

  showSection('SERVICE HEALTH CHECK 🏥');
  const spin = spinner('Checking all services...').start();

  const results = await checkHealth();
  spin.stop();

  if (json) {
    const healthy = results.filter(r => r.status === 'up').length;
    console.log(JSON.stringify({
      healthy,
      total: results.length,
      services: results.map(r => ({
        name: r.name,
        status: r.status,
        latencyMs: r.responseMs,
        description: r.desc,
        error: r.error || null,
      })),
      timestamp: new Date().toISOString(),
    }, null, 2));
    return results;
  }

  // Status indicators
  const statusIcon = (s) => {
    if (s === 'up') return theme.success('● UP');
    if (s === 'timeout') return theme.warning('◐ TIMEOUT');
    return theme.error('○ DOWN');
  };

  const latencyColor = (ms) => {
    if (ms < 300) return theme.success(`${ms}ms`);
    if (ms < 1000) return theme.warning(`${ms}ms`);
    return theme.error(`${ms}ms`);
  };

  // Display table
  const headers = ['Service', 'Status', 'Latency', 'Details'];
  const rows = results.map(r => [
    theme.bright(r.name),
    statusIcon(r.status),
    latencyColor(r.responseMs),
    r.status === 'up' ? theme.dim(r.desc) : theme.error(r.error || ''),
  ]);

  console.log('');
  table(headers, rows);

  // Summary
  const healthy = results.filter(r => r.status === 'up').length;
  const total = results.length;
  console.log('');

  if (healthy === total) {
    success(`${healthy}/${total} services healthy`);
  } else if (healthy > 0) {
    info(`${healthy}/${total} services healthy`);
  } else {
    error(`${healthy}/${total} services healthy`);
  }
  console.log('');
}
