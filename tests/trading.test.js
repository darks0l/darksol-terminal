import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { resolveToken } from '../src/trading/swap.js';

test('resolveToken resolves known symbols', () => {
  assert.equal(resolveToken('ETH', 'base'), ethers.ZeroAddress);
  assert.equal(resolveToken('usdc', 'base'), '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(resolveToken('WETH', 'ethereum'), '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
});

test('resolveToken accepts direct token addresses', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';
  assert.equal(resolveToken(address, 'base'), address);
});

test('resolveToken handles unknown symbols and chain fallback', () => {
  assert.equal(resolveToken('NOT_A_TOKEN', 'base'), null);
  assert.equal(resolveToken('USDC', 'unknown-chain'), '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(resolveToken('0xabc', 'base'), null);
});
