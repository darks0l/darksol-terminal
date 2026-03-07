import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const WALLET_DIR = join(homedir(), '.darksol', 'wallets');
const ALGORITHM = 'aes-256-gcm';
const SCRYPT_N = 2 ** 18;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const SCRYPT_MAXMEM = 512 * 1024 * 1024;

function ensureDir() {
  if (!existsSync(WALLET_DIR)) {
    mkdirSync(WALLET_DIR, { recursive: true });
  }
}

// Encrypt a private key with a password
export function encryptKey(privateKey, password) {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    maxmem: SCRYPT_MAXMEM,
  });

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: ALGORITHM,
    kdf: 'scrypt',
    kdfParams: { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p },
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: encrypted,
  };
}

// Decrypt a private key with a password
export function decryptKey(keystore, password) {
  const salt = Buffer.from(keystore.salt, 'hex');
  const iv = Buffer.from(keystore.iv, 'hex');
  const tag = Buffer.from(keystore.tag, 'hex');

  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: keystore.kdfParams.N,
    r: keystore.kdfParams.r,
    p: keystore.kdfParams.p,
    maxmem: SCRYPT_MAXMEM,
  });

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(keystore.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Save wallet to disk
export function saveWallet(name, address, keystoreData, metadata = {}) {
  ensureDir();
  const walletFile = join(WALLET_DIR, `${name}.json`);

  const wallet = {
    name,
    address,
    keystore: keystoreData,
    chain: metadata.chain || 'base',
    createdAt: new Date().toISOString(),
    ...metadata,
  };

  writeFileSync(walletFile, JSON.stringify(wallet, null, 2));
  return walletFile;
}

// Load wallet from disk
export function loadWallet(name) {
  const walletFile = join(WALLET_DIR, `${name}.json`);
  if (!existsSync(walletFile)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  return JSON.parse(readFileSync(walletFile, 'utf8'));
}

// List all wallets
export function listWallets() {
  ensureDir();
  const files = readdirSync(WALLET_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(readFileSync(join(WALLET_DIR, f), 'utf8'));
    return {
      name: data.name,
      address: data.address,
      chain: data.chain,
      createdAt: data.createdAt,
    };
  });
}

// Delete wallet
export function deleteWallet(name) {
  const walletFile = join(WALLET_DIR, `${name}.json`);
  if (!existsSync(walletFile)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  unlinkSync(walletFile);
}

// Check if wallet exists
export function walletExists(name) {
  return existsSync(join(WALLET_DIR, `${name}.json`));
}

export { WALLET_DIR };
