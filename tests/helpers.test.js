import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as helpers from '../src/utils/helpers.js';
import { resolveToken as swapResolveToken } from '../src/trading/swap.js';
import {
  formatPrice as uiFormatPrice,
  formatChange as uiFormatChange,
  formatAddress as uiFormatAddress,
} from '../src/ui/components.js';

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-9;]*m/g, '');
}

const resolveToken = helpers.resolveToken ?? swapResolveToken;
const formatPrice = helpers.formatPrice ?? uiFormatPrice;
const formatChange = helpers.formatChange ?? uiFormatChange;
const formatAddress = helpers.formatAddress ?? uiFormatAddress;
const formatETH = helpers.formatETH;
const formatUSD = helpers.formatUSD;
const shortHash = helpers.shortHash ?? helpers.shortAddress;
const validateAddress = helpers.validateAddress ?? helpers.isValidAddress;
const isValidAmount = helpers.isValidAmount;
const retry = helpers.retry;
const sleep = helpers.sleep;

describe('resolveToken', () => {
  it('resolves known symbols case-insensitively', () => {
    assert.equal(resolveToken('ETH', 'base'), '0x0000000000000000000000000000000000000000');
    assert.equal(resolveToken('usdc', 'base'), '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  });

  it('accepts direct addresses and rejects unknown/invalid values', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    assert.equal(resolveToken(address, 'base'), address);
    assert.equal(resolveToken('NOT_A_TOKEN', 'base'), null);
    assert.equal(resolveToken('0xabc', 'base'), null);
  });
});

describe('formatPrice', () => {
  it('formats standard values and very small values', () => {
    assert.equal(formatPrice(12.3456), '$12.35');
    assert.equal(formatPrice(0.001234), '$0.001234');
  });

  it('handles invalid and zero values', () => {
    assert.equal(stripAnsi(formatPrice('invalid')), 'N/A');
    assert.equal(formatPrice(0), '$0.000');
  });
});

describe('formatChange', () => {
  it('formats positive, negative, and zero percentages', () => {
    assert.equal(stripAnsi(formatChange(2.3456)), '+2.35%');
    assert.equal(stripAnsi(formatChange(-2.3456)), '-2.35%');
    assert.equal(stripAnsi(formatChange(0)), '+0.00%');
  });

  it('returns N/A for invalid input', () => {
    assert.equal(stripAnsi(formatChange('x')), 'N/A');
  });
});

describe('formatAddress', () => {
  it('shortens valid addresses consistently', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    assert.equal(formatAddress(addr), '0x1234...5678');
    assert.equal(formatAddress(addr, 8), '0x123456...5678');
  });

  it('handles empty and wrong-length addresses without throwing', () => {
    assert.equal(stripAnsi(formatAddress('')), 'N/A');
    assert.equal(formatAddress('0x1234'), '0x1234...1234');
  });
});

describe('formatETH', () => {
  it('formats wei into ETH with default and custom decimals', () => {
    assert.equal(formatETH(1000000000000000000n), '1.000000 ETH');
    assert.equal(formatETH(1234500000000000000n, 3), '1.234 ETH');
  });

  it('formats zero and negative values', () => {
    assert.equal(formatETH(0n), '0.000000 ETH');
    assert.equal(formatETH(-1000000000000000000n, 2), '-1.00 ETH');
  });
});

describe('formatUSD', () => {
  it('formats standard positive and negative values', () => {
    assert.equal(formatUSD(12.3456), '$12.35');
    assert.equal(formatUSD(-12.3456), '$-12.35');
  });

  it('handles tiny positive, zero, and invalid values', () => {
    assert.equal(formatUSD(0.009876), '$0.009876');
    assert.equal(formatUSD(0), '$0.00');
    assert.equal(formatUSD('nope'), '$0.00');
  });
});

describe('shortHash', () => {
  it('shortens hash-like strings', () => {
    const hash = '0x' + 'a'.repeat(64);
    assert.equal(shortHash(hash), `${hash.slice(0, 6)}...${hash.slice(-4)}`);
  });

  it('handles null/empty inputs', () => {
    assert.equal(shortHash(''), 'N/A');
    assert.equal(shortHash(null), 'N/A');
  });
});

describe('validateAddress', () => {
  it('returns true for valid address', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    assert.equal(validateAddress(address), true);
  });

  it('returns false for invalid shape or wrong length', () => {
    assert.equal(validateAddress('0x1234'), false);
    assert.equal(validateAddress('not-an-address'), false);
    assert.equal(validateAddress(null), false);
  });
});

describe('isValidAmount', () => {
  it('accepts positive numeric values', () => {
    assert.equal(isValidAmount(1), true);
    assert.equal(isValidAmount('0.0001'), true);
  });

  it('rejects zero, negative, and invalid values', () => {
    assert.equal(isValidAmount(0), false);
    assert.equal(isValidAmount(-1), false);
    assert.equal(isValidAmount('abc'), false);
    assert.equal(isValidAmount(null), false);
  });
});

describe('retry', () => {
  it('returns on first success without retries', async () => {
    let calls = 0;
    const result = await retry(async () => {
      calls += 1;
      return 'ok';
    }, 3, 1);

    assert.equal(result, 'ok');
    assert.equal(calls, 1);
  });

  it('retries failures and eventually succeeds', async () => {
    let calls = 0;
    const result = await retry(async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'done';
    }, 5, 1);

    assert.equal(result, 'done');
    assert.equal(calls, 3);
  });

  it('throws the last error after exhausting retries', async () => {
    let calls = 0;
    await assert.rejects(
      retry(async () => {
        calls += 1;
        throw new Error(`fail-${calls}`);
      }, 2, 1),
      /fail-3/,
    );
    assert.equal(calls, 3);
  });
});

describe('sleep', () => {
  it('waits at least approximately the requested duration', async () => {
    const ms = 15;
    const start = Date.now();
    await sleep(ms);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 10, `expected >= 10ms, got ${elapsed}ms`);
  });
});
