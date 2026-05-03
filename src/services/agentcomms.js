import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL } from '../config/store.js';
import { theme } from '../ui/theme.js';
import { spinner, kvDisplay, error, info, table, warn } from '../ui/components.js';
import { showSection } from '../ui/banner.js';

function serviceBase() {
  const configured = getServiceURL('agentcomms');
  if (configured) return configured.replace(/\/$/, '');

  // Older installs may only have `services.cards`, sometimes set to /cards.
  // AgentComms API lives at the ACP root, so strip the page path if present.
  const cardsBase = getServiceURL('cards');
  if (cardsBase) return cardsBase.replace(/\/$/, '').replace(/\/cards$/i, '');

  return 'https://acp.darksol.net';
}

const BASE = () => serviceBase();

function endpoint(path) {
  return `${BASE()}${path}`;
}

function normalizeLines(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.lines)) return value.lines;
  if (Array.isArray(value?.numbers)) return value.numbers;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeMessages(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.messages)) return value.messages;
  if (Array.isArray(value?.sms)) return value.sms;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

export async function agentCommsHealth(opts = {}) {
  const spin = spinner('Checking AgentComms...').start();
  try {
    const data = await fetchJSON(endpoint('/api/agentcomms/health'));
    spin.succeed('AgentComms status loaded');

    if (opts.json) {
      console.log(toJson(data));
      return data;
    }

    showSection('AGENTCOMMS');
    kvDisplay([
      ['Service', data.name || data.service || 'DARKSOL AgentComms'],
      ['Status', data.status || 'unknown'],
      ['Base URL', data.baseUrl || `${BASE()}/agentcomms`],
      ['Disposable SMS', data.disposable?.status || data.features?.disposable || 'available'],
      ['Premium Lines', data.premium?.status || data.features?.premium || 'rolling out'],
      ['x402', data.x402?.enabled === false ? 'disabled' : 'enabled'],
    ]);

    if (data.description) {
      console.log('');
      console.log(theme.dim(`  ${data.description}`));
    }
  } catch (err) {
    spin.fail('AgentComms unreachable');
    error(err.message);
    info('Check: https://acp.darksol.net/agentcomms');
  }
}

export async function agentCommsCountries(opts = {}) {
  const spin = spinner('Loading AgentComms countries...').start();
  try {
    const data = await fetchJSON(endpoint('/api/agentcomms/countries'));
    spin.succeed('Countries loaded');

    if (opts.json) {
      console.log(toJson(data));
      return data;
    }

    const countries = data.countries || data.data || data || [];
    showSection('AGENTCOMMS COUNTRIES');
    if (!Array.isArray(countries) || countries.length === 0) {
      warn('No countries returned by service.');
      return data;
    }

    table(['Code', 'Country', 'Price', 'Available'], countries.map((c) => [
      c.countryCode || c.code || c.iso || '-',
      c.name || c.country || '-',
      c.priceUsd ? `$${c.priceUsd}` : (c.price || '-'),
      c.available === false ? 'no' : 'yes',
    ]));
    return data;
  } catch (err) {
    spin.fail('Countries failed');
    error(err.message);
  }
}

export async function agentCommsBuyNumber(opts = {}) {
  const countryCode = opts.country || opts.countryCode || 'US';
  const spin = spinner(`Requesting ${countryCode} disposable number...`).start();
  try {
    const data = await fetchJSON(endpoint('/api/agentcomms/numbers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        countryCode,
        agentId: opts.agentId,
        callbackUrl: opts.callbackUrl,
        label: opts.label,
      }),
    });
    spin.succeed('Number request complete');

    if (opts.json) {
      console.log(toJson(data));
      return data;
    }

    showSection('AGENTCOMMS NUMBER');
    const line = data.number || data.line || data;
    kvDisplay([
      ['Number ID', line.id || line.numberId || data.id || data.numberId || '-'],
      ['Phone', line.phoneNumber || line.number || data.phoneNumber || data.number || '-'],
      ['Country', line.countryCode || data.countryCode || countryCode],
      ['Status', line.status || data.status || '-'],
      ['Expires', line.expiresAt || data.expiresAt || '-'],
    ]);
    console.log('');
    info('Check SMS: darksol agentcomms messages <numberId>');
    return data;
  } catch (err) {
    spin.fail('Number request failed');
    error(err.message);
    info('If this is x402-gated, call the web flow: https://acp.darksol.net/agentcomms');
  }
}

export async function agentCommsMessages(numberId, opts = {}) {
  const spin = spinner('Checking SMS messages...').start();
  try {
    const qs = new URLSearchParams();
    if (numberId) qs.set('numberId', numberId);
    if (opts.phoneNumber) qs.set('phoneNumber', opts.phoneNumber);
    const data = await fetchJSON(endpoint(`/api/agentcomms/messages${qs.toString() ? `?${qs}` : ''}`));
    spin.succeed('Messages loaded');

    if (opts.json) {
      console.log(toJson(data));
      return data;
    }

    showSection('AGENTCOMMS MESSAGES');
    const messages = normalizeMessages(data);
    if (messages.length === 0) {
      warn('No messages yet.');
      return data;
    }

    table(['From', 'Message', 'Received'], messages.map((m) => [
      m.from || m.sender || '-',
      String(m.body || m.text || m.message || '').slice(0, 80),
      m.receivedAt || m.createdAt || m.timestamp || '-',
    ]));
    return data;
  } catch (err) {
    spin.fail('Message check failed');
    error(err.message);
  }
}

export async function agentCommsPremiumSearch(opts = {}) {
  const spin = spinner('Searching premium durable lines...').start();
  try {
    const qs = new URLSearchParams();
    qs.set('countryCode', opts.country || opts.countryCode || 'US');
    if (opts.areaCode) qs.set('areaCode', opts.areaCode);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const data = await fetchJSON(endpoint(`/api/agentcomms/premium/search?${qs}`));
    spin.succeed('Premium search loaded');

    if (opts.json) {
      console.log(toJson(data));
      return data;
    }

    showSection('PREMIUM AGENTCOMMS LINES');
    const lines = normalizeLines(data);
    if (lines.length === 0) {
      warn('No premium lines returned. Premium durable messaging may still be rolling out.');
      return data;
    }

    table(['Phone', 'Region', 'Monthly', 'Capabilities'], lines.map((line) => [
      line.phoneNumber || line.number || '-',
      line.region || line.locality || line.countryCode || '-',
      line.monthlyCost || line.priceMonthly || line.price || '-',
      Array.isArray(line.capabilities) ? line.capabilities.join(', ') : (line.capabilities || 'sms'),
    ]));
    return data;
  } catch (err) {
    spin.fail('Premium search failed');
    error(err.message);
  }
}
