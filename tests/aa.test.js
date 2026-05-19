import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { createSessionPolicy, buildBatchPlan, removeSessionPolicy, listSessionPolicies } from '../src/services/aa.js';

test('buildBatchPlan normalizes calls for AA batching', () => {
  const wallet = ethers.Wallet.createRandom();
  const payload = buildBatchPlan({
    wallet: wallet.address,
    chain: 'base',
    calls: [
      { to: wallet.address, data: '0x', value: '0' },
    ],
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.batch.callCount, 1);
  assert.equal(payload.batch.calls[0].to, wallet.address);
});

test('session policy lifecycle stores and removes policy', () => {
  const wallet = ethers.Wallet.createRandom();
  const created = createSessionPolicy({
    id: 'test-policy',
    name: 'test-policy',
    allowedTargets: [wallet.address],
    allowedSelectors: ['0xa9059cbb'],
  });
  assert.equal(created.ok, true);
  const listed = listSessionPolicies();
  assert.ok(listed.policies.find((policy) => policy.id === 'test-policy'));
  const removed = removeSessionPolicy('test-policy');
  assert.equal(removed.ok, true);
});
