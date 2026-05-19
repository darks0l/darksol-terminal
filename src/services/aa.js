import { ethers } from 'ethers';
import { getConfig, setConfig, getRPC } from '../config/store.js';
import { loadWallet } from '../wallet/keystore.js';

const DEFAULTS = {
  enabled: false,
  chain: 'base',
  accountType: 'unspecified',
  bundlerUrl: '',
  paymasterUrl: '',
  entryPoint: '',
  factory: '',
  sessionPolicies: [],
};

function hexChainId(chainId) {
  return `0x${Number(chainId || 0).toString(16)}`;
}

function compactAddress(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length < 10) return raw || '-';
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}

function normalizeAddress(value, field = 'address') {
  if (!value) throw new Error(`${field} is required`);
  try {
    return ethers.getAddress(String(value).trim());
  } catch {
    throw new Error(`Invalid ${field}`);
  }
}

function normalizeHexData(value) {
  if (value == null || value === '') return '0x';
  const raw = String(value).trim();
  if (!/^0x[0-9a-fA-F]*$/.test(raw)) throw new Error('Invalid hex data');
  return raw;
}

function normalizeValue(value) {
  if (value == null || value === '') return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return ethers.parseEther(String(value));
  const raw = String(value).trim();
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return BigInt(raw);
  if (/^[0-9]+$/.test(raw)) return BigInt(raw);
  return ethers.parseEther(raw);
}

function normalizeSessionPolicy(input = {}) {
  const id = String(input.id || input.name || `policy_${Date.now()}`).trim();
  const policy = {
    id,
    name: String(input.name || id).trim(),
    signerType: String(input.signerType || 'session-key').trim(),
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    maxValueEth: Number(input.maxValueEth ?? input.maxValue ?? 0),
    maxDailyValueEth: Number(input.maxDailyValueEth ?? input.maxDailyValue ?? 0),
    allowedTargets: Array.from(new Set((Array.isArray(input.allowedTargets) ? input.allowedTargets : []).map((value) => normalizeAddress(value, 'allowed target')))),
    allowedSelectors: Array.from(new Set((Array.isArray(input.allowedSelectors) ? input.allowedSelectors : []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))),
    spendingTokenAllowlist: Array.from(new Set((Array.isArray(input.spendingTokenAllowlist) ? input.spendingTokenAllowlist : []).map((value) => normalizeAddress(value, 'token allowlist entry')))),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
  if (!policy.name) throw new Error('Policy name is required');
  return policy;
}

export function getAAConfig() {
  const current = getConfig('aa') || {};
  return {
    ...DEFAULTS,
    ...current,
    sessionPolicies: Array.isArray(current.sessionPolicies) ? current.sessionPolicies : [],
  };
}

export function setAAConfig(patch = {}) {
  const next = {
    ...getAAConfig(),
    ...patch,
  };
  setConfig('aa', next);
  return next;
}

export function getWalletContext(walletName = null) {
  const resolved = walletName || getConfig('activeWallet');
  if (!resolved) throw new Error('No active wallet configured');
  if (typeof resolved === 'string' && resolved.startsWith('0x') && resolved.length === 42) {
    return {
      name: 'direct-address',
      address: ethers.getAddress(resolved),
      chain: getConfig('chain') || 'base',
    };
  }
  const wallet = loadWallet(resolved);
  return {
    name: wallet.name,
    address: ethers.getAddress(wallet.address),
    chain: wallet.chain || getConfig('chain') || 'base',
  };
}

export async function getAAStatus(opts = {}) {
  const config = getAAConfig();
  const wallet = getWalletContext(opts.wallet);
  const chain = opts.chain || config.chain || wallet.chain || 'base';
  const provider = new ethers.JsonRpcProvider(getRPC(chain));
  const network = await provider.getNetwork();
  const feeData = await provider.getFeeData();
  const readiness = {
    bundlerConfigured: Boolean(config.bundlerUrl),
    paymasterConfigured: Boolean(config.paymasterUrl),
    entryPointConfigured: Boolean(config.entryPoint),
    factoryConfigured: Boolean(config.factory),
    sessionPoliciesConfigured: Array.isArray(config.sessionPolicies) && config.sessionPolicies.length > 0,
  };
  const ready = readiness.bundlerConfigured && readiness.entryPointConfigured && readiness.factoryConfigured;
  return {
    ok: true,
    chain,
    wallet,
    accountType: config.accountType,
    enabled: Boolean(config.enabled),
    ready,
    readiness,
    bundlerUrl: config.bundlerUrl || null,
    paymasterUrl: config.paymasterUrl || null,
    entryPoint: config.entryPoint || null,
    factory: config.factory || null,
    sessionPolicyCount: config.sessionPolicies.length,
    network: {
      chainId: Number(network.chainId),
      chainIdHex: hexChainId(network.chainId),
      name: network.name,
    },
    fees: {
      gasPriceGwei: Number(ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')),
      maxFeePerGasGwei: Number(ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei')),
      maxPriorityFeePerGasGwei: Number(ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, 'gwei')),
    },
    summary: ready
      ? `${config.accountType || 'AA'} ready on ${chain} for ${compactAddress(wallet.address)}`
      : `AA not ready yet on ${chain}: ${Object.entries(readiness).filter(([, value]) => !value).map(([key]) => key).join(', ')}`,
  };
}

export function createSessionPolicy(input = {}) {
  const config = getAAConfig();
  const policy = normalizeSessionPolicy(input);
  const existing = config.sessionPolicies.filter((entry) => entry.id !== policy.id);
  const next = {
    ...config,
    sessionPolicies: [...existing, policy],
  };
  setConfig('aa', next);
  return {
    ok: true,
    policy,
    count: next.sessionPolicies.length,
    summary: `Saved session policy ${policy.name}`,
  };
}

export function listSessionPolicies() {
  const config = getAAConfig();
  return {
    ok: true,
    policies: config.sessionPolicies,
    count: config.sessionPolicies.length,
    summary: config.sessionPolicies.length ? `Loaded ${config.sessionPolicies.length} session policies` : 'No session policies configured',
  };
}

export function removeSessionPolicy(id) {
  const config = getAAConfig();
  const nextPolicies = config.sessionPolicies.filter((entry) => entry.id !== id);
  setConfig('aa', {
    ...config,
    sessionPolicies: nextPolicies,
  });
  return {
    ok: true,
    removed: config.sessionPolicies.length !== nextPolicies.length,
    count: nextPolicies.length,
    summary: config.sessionPolicies.length !== nextPolicies.length ? `Removed session policy ${id}` : `No session policy found for ${id}`,
  };
}

export async function simulateWalletCalls({ wallet, chain, calls } = {}) {
  const walletCtx = getWalletContext(wallet);
  const resolvedChain = chain || walletCtx.chain || getConfig('chain') || 'base';
  const provider = new ethers.JsonRpcProvider(getRPC(resolvedChain));
  const normalizedCalls = (Array.isArray(calls) ? calls : []).map((call, index) => {
    const to = normalizeAddress(call.to, `call ${index + 1} to`);
    const data = normalizeHexData(call.data);
    const value = normalizeValue(call.value);
    return {
      index,
      to,
      data,
      value,
      label: String(call.label || `call-${index + 1}`),
      static: call.static !== false,
    };
  });

  if (!normalizedCalls.length) throw new Error('simulateWalletCalls requires at least one call');

  const results = [];
  let totalValue = 0n;
  let totalEstimatedGas = 0n;

  for (const call of normalizedCalls) {
    totalValue += call.value;
    const tx = {
      from: walletCtx.address,
      to: call.to,
      data: call.data,
      value: call.value,
    };
    try {
      const estimatedGas = await provider.estimateGas(tx);
      totalEstimatedGas += estimatedGas;
      let returnData = null;
      if (call.static) {
        try {
          returnData = await provider.call(tx);
        } catch (error) {
          returnData = null;
          results.push({
            index: call.index,
            label: call.label,
            to: call.to,
            ok: false,
            estimatedGas: estimatedGas.toString(),
            valueWei: call.value.toString(),
            error: error.message,
          });
          continue;
        }
      }
      results.push({
        index: call.index,
        label: call.label,
        to: call.to,
        ok: true,
        estimatedGas: estimatedGas.toString(),
        valueWei: call.value.toString(),
        returnData,
      });
    } catch (error) {
      results.push({
        index: call.index,
        label: call.label,
        to: call.to,
        ok: false,
        estimatedGas: null,
        valueWei: call.value.toString(),
        error: error.message,
      });
    }
  }

  const okCount = results.filter((entry) => entry.ok).length;
  return {
    ok: okCount === results.length,
    wallet: walletCtx,
    chain: resolvedChain,
    calls: results,
    totals: {
      callCount: results.length,
      okCount,
      failedCount: results.length - okCount,
      totalValueWei: totalValue.toString(),
      totalValueEth: ethers.formatEther(totalValue),
      totalEstimatedGas: totalEstimatedGas.toString(),
    },
    summary: `${okCount}/${results.length} calls simulated successfully on ${resolvedChain}`,
  };
}

export function buildBatchPlan({ wallet, chain, calls } = {}) {
  const walletCtx = getWalletContext(wallet);
  const resolvedChain = chain || walletCtx.chain || getConfig('chain') || 'base';
  const normalizedCalls = (Array.isArray(calls) ? calls : []).map((call, index) => ({
    index,
    to: normalizeAddress(call.to, `call ${index + 1} to`),
    data: normalizeHexData(call.data),
    valueWei: normalizeValue(call.value).toString(),
    label: String(call.label || `call-${index + 1}`),
  }));
  if (!normalizedCalls.length) throw new Error('buildBatchPlan requires at least one call');
  return {
    ok: true,
    wallet: walletCtx,
    chain: resolvedChain,
    accountType: getAAConfig().accountType,
    batch: {
      createdAt: new Date().toISOString(),
      callCount: normalizedCalls.length,
      calls: normalizedCalls,
    },
    summary: `Built batch plan with ${normalizedCalls.length} calls for ${compactAddress(walletCtx.address)}`,
  };
}
