import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, formatChange, formatAddress } from '../src/ui/components.js';

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-9;]*m/g, '');
}

test('formatPrice formats values and handles invalid inputs', () => {
  assert.equal(formatPrice(12.3456), '$12.35');
  assert.equal(formatPrice(0.001234), '$0.001234');
  assert.equal(stripAnsi(formatPrice('invalid')), 'N/A');
});

test('formatChange formats positive/negative/zero values', () => {
  assert.equal(stripAnsi(formatChange(2.3456)), '+2.35%');
  assert.equal(stripAnsi(formatChange(-2.3456)), '-2.35%');
  assert.equal(stripAnsi(formatChange(0)), '+0.00%');
  assert.equal(stripAnsi(formatChange('x')), 'N/A');
});

test('formatAddress shortens addresses predictably', () => {
  const addr = '0x1234567890abcdef1234567890abcdef12345678';
  assert.equal(formatAddress(addr), '0x1234...5678');
  assert.equal(formatAddress(addr, 8), '0x123456...5678');
  assert.equal(stripAnsi(formatAddress('')), 'N/A');
});
