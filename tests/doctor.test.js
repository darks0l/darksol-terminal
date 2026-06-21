import test from 'node:test';
import assert from 'node:assert/strict';
import { _doctorInternals } from '../src/services/doctor.js';

test('doctor base checks expose install and harness safety state', () => {
  const checks = _doctorInternals.baseChecks();
  assert.ok(checks.find((check) => check.id === 'node'));
  assert.ok(checks.find((check) => check.id === 'harness-safe-mode'));
});

test('security status reports mutating harness tools and boundaries', () => {
  const status = _doctorInternals.securityBoundaries();
  assert.equal(status.package, '@darksol/terminal');
  assert.equal(status.policy.safeModeByDefault, true);
  assert.ok(Array.isArray(status.boundaries));
  assert.ok(status.mutatingTools.some((tool) => tool.name === 'swap'));
});
