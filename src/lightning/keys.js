/**
 * DARKSOL Lightning — Key Management
 * BIP39 mnemonic → m/535' derivation for LDK seed.
 * Uses the same mnemonic as the existing wallet system.
 */

import { randomBytes, createHash, createHmac } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { encryptKey, decryptKey } from '../wallet/keystore.js';

const LN_KEYSTORE_DIR = join(homedir(), '.darksol', 'lightning', 'keys');

/**
 * BIP39 English wordlist (2048 words).
 * We ship a minimal implementation; for production use, import from a BIP39 lib.
 */
let _wordlist = null;

async function getWordlist() {
  if (_wordlist) return _wordlist;
  try {
    // Try to use ethers' built-in wordlist
    const { ethers } = await import('ethers');
    if (ethers.Mnemonic && ethers.Mnemonic.fromEntropy) {
      // ethers v6 has built-in BIP39 support
      _wordlist = 'ethers';
      return _wordlist;
    }
  } catch {}
  _wordlist = 'ethers';
  return _wordlist;
}

/**
 * Generate a new BIP39 mnemonic (24 words / 256 bits).
 */
export async function generateMnemonic() {
  const { ethers } = await import('ethers');
  const entropy = randomBytes(32);
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
  return mnemonic.phrase;
}

/**
 * Validate a BIP39 mnemonic phrase.
 */
export async function validateMnemonic(phrase) {
  try {
    const { ethers } = await import('ethers');
    ethers.Mnemonic.fromPhrase(phrase);
    return true;
  } catch {
    return false;
  }
}

/**
 * Derive the LDK seed from a BIP39 mnemonic at path m/535'.
 * Returns a 32-byte Buffer suitable for LDK KeysManager initialization.
 *
 * BIP32 derivation:
 *   mnemonic → BIP39 seed (512 bits)
 *   → HMAC-SHA512 with "Bitcoin seed" → master key
 *   → derive child at index 535' (hardened)
 *   → take the 32-byte private key as LDK seed
 */
export async function deriveLdkSeed(mnemonic) {
  const { ethers } = await import('ethers');
  // Derive using ethers HD wallet at m/535'
  const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, "m/535'");
  // The private key is 32 bytes — perfect for LDK seed
  const seed = Buffer.from(hdNode.privateKey.slice(2), 'hex');
  return seed;
}

/**
 * Derive the full BIP39 seed (64 bytes) from mnemonic + passphrase.
 */
export async function deriveBip39Seed(mnemonic, passphrase = '') {
  const { pbkdf2Sync } = await import('crypto');
  const mnemonicBuffer = Buffer.from(mnemonic.normalize('NFKD'), 'utf8');
  const saltBuffer = Buffer.from(`mnemonic${passphrase}`.normalize('NFKD'), 'utf8');
  return pbkdf2Sync(mnemonicBuffer, saltBuffer, 2048, 64, 'sha512');
}

/**
 * Generate an entropy-based node ID from the LDK seed.
 * This simulates what LDK does internally for the node pubkey.
 */
export function seedToNodeId(seed) {
  // SHA-256 of seed gives us a deterministic 32-byte value
  // In real LDK, this would be the secp256k1 public key from the seed
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * Store an encrypted mnemonic for Lightning use.
 */
export function storeMnemonic(mnemonic, password) {
  ensureKeyDir();
  const keystoreData = encryptKey(mnemonic, password);
  const filePath = join(LN_KEYSTORE_DIR, 'mnemonic.json');
  writeFileSync(filePath, JSON.stringify(keystoreData, null, 2));
  return filePath;
}

/**
 * Load and decrypt the stored mnemonic.
 */
export function loadMnemonic(password) {
  const filePath = join(LN_KEYSTORE_DIR, 'mnemonic.json');
  if (!existsSync(filePath)) {
    throw new Error('No Lightning mnemonic found. Run: darksol lightning init');
  }
  const keystoreData = JSON.parse(readFileSync(filePath, 'utf8'));
  return decryptKey(keystoreData, password);
}

/**
 * Check if a Lightning mnemonic is stored.
 */
export function hasMnemonic() {
  return existsSync(join(LN_KEYSTORE_DIR, 'mnemonic.json'));
}

/**
 * Store the derived LDK seed (encrypted).
 */
export function storeSeed(seed, password) {
  ensureKeyDir();
  const keystoreData = encryptKey(seed.toString('hex'), password);
  const filePath = join(LN_KEYSTORE_DIR, 'ldk-seed.json');
  writeFileSync(filePath, JSON.stringify(keystoreData, null, 2));
  return filePath;
}

/**
 * Load the derived LDK seed.
 */
export function loadSeed(password) {
  const filePath = join(LN_KEYSTORE_DIR, 'ldk-seed.json');
  if (!existsSync(filePath)) {
    throw new Error('No LDK seed found. Run: darksol lightning init');
  }
  const keystoreData = JSON.parse(readFileSync(filePath, 'utf8'));
  const hex = decryptKey(keystoreData, password);
  return Buffer.from(hex, 'hex');
}

/**
 * Check if the LDK seed is stored.
 */
export function hasSeed() {
  return existsSync(join(LN_KEYSTORE_DIR, 'ldk-seed.json'));
}

function ensureKeyDir() {
  if (!existsSync(LN_KEYSTORE_DIR)) {
    mkdirSync(LN_KEYSTORE_DIR, { recursive: true });
  }
}
