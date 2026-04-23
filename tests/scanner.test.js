import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRisk,
  getRecommendation,
  formatNumber,
  CHECK_STATUS,
} from '../src/services/scanner.js';

// ──────────────────────────────────────────────────
// Risk Scoring Tests
// ──────────────────────────────────────────────────

test('calculateRisk: all passes → LOW', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'LOW');
  assert.equal(risk.passed, 4);
  assert.equal(risk.failed, 0);
  assert.equal(risk.warned, 0);
});

test('calculateRisk: one warning → LOW', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.WARN },
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'LOW');
  assert.equal(risk.warned, 1);
});

test('calculateRisk: two warnings → MEDIUM', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.WARN },
    { status: CHECK_STATUS.WARN },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'MEDIUM');
  assert.equal(risk.warned, 2);
});

test('calculateRisk: one failure → HIGH', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'HIGH');
  assert.equal(risk.failed, 1);
});

test('calculateRisk: two failures → HIGH', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'HIGH');
  assert.equal(risk.failed, 2);
});

test('calculateRisk: three or more failures → CRITICAL', () => {
  const checks = [
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'CRITICAL');
  assert.equal(risk.failed, 3);
});

test('calculateRisk: errors count as warnings', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.ERROR },
    { status: CHECK_STATUS.ERROR },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'MEDIUM');
  assert.equal(risk.warned, 2);
});

test('calculateRisk: three warnings → HIGH', () => {
  const checks = [
    { status: CHECK_STATUS.WARN },
    { status: CHECK_STATUS.WARN },
    { status: CHECK_STATUS.WARN },
    { status: CHECK_STATUS.PASS },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'HIGH');
});

test('calculateRisk: empty checks → LOW', () => {
  const risk = calculateRisk([]);
  assert.equal(risk.level, 'LOW');
  assert.equal(risk.total, 0);
});

test('calculateRisk: score calculation', () => {
  const checks = [
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.PASS },
    { status: CHECK_STATUS.FAIL },
    { status: CHECK_STATUS.WARN },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.score, 50); // 2 passed out of 4 = 50%
  assert.equal(risk.total, 4);
});

// ──────────────────────────────────────────────────
// Recommendation Tests
// ──────────────────────────────────────────────────

test('getRecommendation: CRITICAL level', () => {
  const risk = { level: 'CRITICAL' };
  const checks = [];
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('DO NOT TRADE'));
});

test('getRecommendation: honeypot failure', () => {
  const risk = { level: 'HIGH' };
  const checks = [{ id: 'honeypot', status: CHECK_STATUS.FAIL }];
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('honeypot'));
});

test('getRecommendation: no liquidity failure', () => {
  const risk = { level: 'HIGH' };
  const checks = [{ id: 'liquidity', status: CHECK_STATUS.FAIL }];
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('no liquidity'));
});

test('getRecommendation: HIGH level without specific failure', () => {
  const risk = { level: 'HIGH' };
  const checks = [{ id: 'mint', status: CHECK_STATUS.FAIL }];
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('EXTREME CAUTION'));
});

test('getRecommendation: MEDIUM level', () => {
  const risk = { level: 'MEDIUM' };
  const checks = [];
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('CAUTION'));
});

test('getRecommendation: LOW level', () => {
  const risk = { level: 'LOW' };
  const checks = [];
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('Lower risk'));
});

// ──────────────────────────────────────────────────
// Format Number Tests
// ──────────────────────────────────────────────────

test('formatNumber: trillions', () => {
  assert.equal(formatNumber(1.5e12), '1.50T');
});

test('formatNumber: billions', () => {
  assert.equal(formatNumber(2.3e9), '2.30B');
});

test('formatNumber: millions', () => {
  assert.equal(formatNumber(4.567e6), '4.57M');
});

test('formatNumber: thousands', () => {
  assert.equal(formatNumber(12345), '12.35K');
});

test('formatNumber: regular numbers', () => {
  assert.equal(formatNumber(42.5), '42.50');
});

test('formatNumber: small numbers', () => {
  assert.equal(formatNumber(0.001234), '0.001234');
});

// ──────────────────────────────────────────────────
// CHECK_STATUS constant tests
// ──────────────────────────────────────────────────

test('CHECK_STATUS has expected values', () => {
  assert.equal(CHECK_STATUS.PASS, 'pass');
  assert.equal(CHECK_STATUS.WARN, 'warn');
  assert.equal(CHECK_STATUS.FAIL, 'fail');
  assert.equal(CHECK_STATUS.ERROR, 'error');
});

// ──────────────────────────────────────────────────
// Mixed scenario tests
// ──────────────────────────────────────────────────

test('calculateRisk: realistic safe token', () => {
  const checks = [
    { status: CHECK_STATUS.PASS, id: 'verification' },
    { status: CHECK_STATUS.PASS, id: 'ownership' },
    { status: CHECK_STATUS.PASS, id: 'honeypot' },
    { status: CHECK_STATUS.PASS, id: 'liquidity' },
    { status: CHECK_STATUS.PASS, id: 'holders' },
    { status: CHECK_STATUS.PASS, id: 'proxy' },
    { status: CHECK_STATUS.PASS, id: 'mint' },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'LOW');
  assert.equal(risk.score, 100);
});

test('calculateRisk: realistic risky token', () => {
  const checks = [
    { status: CHECK_STATUS.WARN, id: 'verification' },
    { status: CHECK_STATUS.WARN, id: 'ownership' },
    { status: CHECK_STATUS.FAIL, id: 'honeypot' },
    { status: CHECK_STATUS.WARN, id: 'liquidity' },
    { status: CHECK_STATUS.FAIL, id: 'holders' },
    { status: CHECK_STATUS.PASS, id: 'proxy' },
    { status: CHECK_STATUS.WARN, id: 'mint' },
  ];
  const risk = calculateRisk(checks);
  assert.equal(risk.level, 'HIGH');
  assert.equal(risk.failed, 2);
  assert.equal(risk.warned, 4);
});

test('getRecommendation: realistic risky token recommendation', () => {
  const checks = [
    { status: CHECK_STATUS.FAIL, id: 'honeypot' },
    { status: CHECK_STATUS.FAIL, id: 'holders' },
    { status: CHECK_STATUS.WARN, id: 'mint' },
    { status: CHECK_STATUS.PASS, id: 'proxy' },
  ];
  const risk = calculateRisk(checks);
  const rec = getRecommendation(risk, checks);
  assert.ok(rec.includes('honeypot'));
});
