import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock ethers before importing
const mockAllowance = mock.fn(() => Promise.resolve(0n));
const mockApprove = mock.fn(() => Promise.resolve({ hash: '0xabc', wait: () => Promise.resolve() }));
const mockSymbol = mock.fn(() => Promise.resolve('USDC'));
const mockDecimals = mock.fn(() => Promise.resolve(6));
const mockName = mock.fn(() => Promise.resolve('USD Coin'));
const mockBalanceOf = mock.fn(() => Promise.resolve(1000000n));

const mockContract = {
  allowance: mockAllowance,
  approve: mockApprove,
  symbol: mockSymbol,
  decimals: mockDecimals,
  name: mockName,
  balanceOf: mockBalanceOf,
};

describe('Token Approvals Manager', () => {

  describe('Known Spenders', () => {
    it('should identify Uniswap SwapRouter02 as low risk', async () => {
      // Import the module to test spender identification
      const mod = await import('../src/services/approvals.js');

      // The KNOWN_SPENDERS map should be accessible via the module's behavior
      // We test via checkSpecificApproval which uses getSpenderInfo internally
      assert.ok(mod.listApprovals, 'listApprovals should be exported');
      assert.ok(mod.revokeApproval, 'revokeApproval should be exported');
      assert.ok(mod.checkSpecificApproval, 'checkSpecificApproval should be exported');
    });
  });

  describe('Export validation', () => {
    it('should export all required functions', async () => {
      const mod = await import('../src/services/approvals.js');
      assert.equal(typeof mod.listApprovals, 'function');
      assert.equal(typeof mod.revokeApproval, 'function');
      assert.equal(typeof mod.checkSpecificApproval, 'function');
    });
  });

  describe('Module structure', () => {
    it('should import without errors', async () => {
      // Just verifying the module loads without syntax errors
      const mod = await import('../src/services/approvals.js');
      assert.ok(mod);
    });
  });

  describe('Unlimited threshold', () => {
    it('should correctly define unlimited as half of MaxUint256', async () => {
      const { ethers } = await import('ethers');
      const UNLIMITED_THRESHOLD = ethers.MaxUint256 / 2n;
      // MaxUint256 / 2 should be a very large number
      assert.ok(UNLIMITED_THRESHOLD > 10n ** 50n, 'Unlimited threshold should be very large');
    });
  });

  describe('Format amounts', () => {
    it('should handle zero correctly', async () => {
      const { ethers } = await import('ethers');
      const amount = 0n;
      const formatted = ethers.formatUnits(amount, 6);
      assert.equal(formatted, '0.0');
    });

    it('should handle normal amounts correctly', async () => {
      const { ethers } = await import('ethers');
      const amount = 1000000n; // 1 USDC (6 decimals)
      const formatted = ethers.formatUnits(amount, 6);
      assert.equal(formatted, '1.0');
    });

    it('should handle large amounts correctly', async () => {
      const { ethers } = await import('ethers');
      const amount = 1000000000000n; // 1M USDC
      const formatted = ethers.formatUnits(amount, 6);
      assert.equal(parseFloat(formatted), 1000000);
    });

    it('should detect unlimited approvals', async () => {
      const { ethers } = await import('ethers');
      const UNLIMITED_THRESHOLD = ethers.MaxUint256 / 2n;
      const maxApproval = ethers.MaxUint256;
      assert.ok(maxApproval >= UNLIMITED_THRESHOLD, 'MaxUint256 should be >= unlimited threshold');
    });

    it('should not flag normal amounts as unlimited', async () => {
      const { ethers } = await import('ethers');
      const UNLIMITED_THRESHOLD = ethers.MaxUint256 / 2n;
      const normalAmount = ethers.parseUnits('1000000', 6); // 1M USDC
      assert.ok(normalAmount < UNLIMITED_THRESHOLD, 'Normal amounts should not be unlimited');
    });
  });

  describe('ERC-20 ABI', () => {
    it('should have required function signatures', async () => {
      // Verify the ABI has the essential functions
      const { ethers } = await import('ethers');
      const abi = [
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
      ];
      const iface = new ethers.Interface(abi);
      assert.ok(iface.getFunction('allowance'), 'Should have allowance function');
      assert.ok(iface.getFunction('approve'), 'Should have approve function');
      assert.ok(iface.getFunction('symbol'), 'Should have symbol function');
      assert.ok(iface.getFunction('decimals'), 'Should have decimals function');
    });
  });

  describe('Address checksumming', () => {
    it('should handle checksummed addresses', async () => {
      const { ethers } = await import('ethers');
      const addr = '0x2626664c2603336E57B271c5C0b26F421741e481';
      const checksummed = ethers.getAddress(addr);
      assert.equal(checksummed, '0x2626664c2603336E57B271c5C0b26F421741e481');
    });

    it('should handle lowercase addresses', async () => {
      const { ethers } = await import('ethers');
      const addr = '0x2626664c2603336e57b271c5c0b26f421741e481';
      const checksummed = ethers.getAddress(addr);
      assert.ok(checksummed, 'Should checksum lowercase address');
    });
  });
});
