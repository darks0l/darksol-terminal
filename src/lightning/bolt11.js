/**
 * DARKSOL Lightning — BOLT11 & BOLT12 Invoice Codec
 * Pure JavaScript implementation for encoding/decoding Lightning invoices.
 * Handles BOLT11 payment requests and BOLT12 offers.
 */

import { createHash, createHmac } from 'crypto';

// ─── Bech32 Implementation ──────────────────────

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values) {
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GENERATOR[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Decode(bechString) {
  let hasLower = false, hasUpper = false;
  for (const c of bechString) {
    if (c >= 'a' && c <= 'z') hasLower = true;
    if (c >= 'A' && c <= 'Z') hasUpper = true;
  }
  if (hasLower && hasUpper) throw new Error('Mixed case');

  const str = bechString.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) throw new Error('Invalid bech32');

  const hrp = str.slice(0, pos);
  const data = [];
  for (let i = pos + 1; i < str.length; i++) {
    const idx = CHARSET.indexOf(str[i]);
    if (idx === -1) throw new Error('Invalid character');
    data.push(idx);
  }

  return { hrp, data: data.slice(0, -6) };
}

function wordsToBuffer(words, fromBits, toBits, pad = true) {
  let acc = 0;
  let bits = 0;
  const result = [];
  const maxv = (1 << toBits) - 1;

  for (const value of words) {
    if (value < 0 || value >> fromBits) throw new Error('Invalid value');
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) result.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid padding');
  }

  return Buffer.from(result);
}

// ─── BOLT11 Decoder ─────────────────────────────

const NETWORK_PREFIXES = {
  bc: 'bitcoin',
  tb: 'testnet',
  bcrt: 'regtest',
  tbs: 'signet',
};

const MULTIPLIERS = {
  m: 0.001,
  u: 0.000001,
  n: 0.000000001,
  p: 0.000000000001,
};

/**
 * Decode a BOLT11 Lightning invoice.
 */
export function decodeBolt11(invoice) {
  if (!invoice || typeof invoice !== 'string') {
    throw new Error('Invalid invoice string');
  }

  // Strip "lightning:" prefix if present
  const cleaned = invoice.replace(/^lightning:/i, '').toLowerCase();

  if (!cleaned.startsWith('ln')) {
    throw new Error('Not a Lightning invoice (must start with "ln")');
  }

  const { hrp, data } = bech32Decode(cleaned);

  // Parse HRP: ln + network + [amount]
  let prefix = hrp;
  let network = null;
  let amountSats = null;

  // Remove 'ln' prefix
  prefix = prefix.slice(2);

  // Find network
  for (const [key, net] of Object.entries(NETWORK_PREFIXES)) {
    if (prefix.startsWith(key)) {
      network = net;
      prefix = prefix.slice(key.length);
      break;
    }
  }

  if (!network) {
    throw new Error(`Unknown network prefix in: ${hrp}`);
  }

  // Parse amount if present
  if (prefix.length > 0) {
    const match = prefix.match(/^(\d+)([munp]?)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const multiplier = match[2] ? MULTIPLIERS[match[2]] : 1;
      const btcAmount = num * multiplier;
      amountSats = Math.round(btcAmount * 100000000);
    }
  }

  // Parse tagged fields from data
  const result = {
    type: 'bolt11',
    network,
    amountSats,
    timestamp: null,
    paymentHash: null,
    description: null,
    descriptionHash: null,
    payeeNodeKey: null,
    expiry: 3600,     // default 1 hour
    minFinalCltvExpiry: 18,
    features: null,
    routeHints: [],
    raw: invoice,
  };

  // First 7 words = timestamp (35 bits)
  if (data.length >= 7) {
    let ts = 0;
    for (let i = 0; i < 7; i++) {
      ts = ts * 32 + data[i];
    }
    result.timestamp = ts;
  }

  // Parse tagged fields
  let idx = 7;
  while (idx < data.length) {
    if (idx + 3 > data.length) break;

    const tag = data[idx];
    const dataLength = data[idx + 1] * 32 + data[idx + 2];
    idx += 3;

    if (idx + dataLength > data.length) break;
    const fieldData = data.slice(idx, idx + dataLength);
    idx += dataLength;

    const tagChar = CHARSET[tag];

    switch (tagChar) {
      case 'p': // payment_hash (SHA256)
        if (fieldData.length === 52) {
          result.paymentHash = wordsToBuffer(fieldData, 5, 8, false).toString('hex');
        }
        break;

      case 'd': // description
        result.description = wordsToBuffer(fieldData, 5, 8, true).toString('utf8').replace(/\0+$/, '');
        break;

      case 'h': // description_hash
        result.descriptionHash = wordsToBuffer(fieldData, 5, 8, false).toString('hex');
        break;

      case 'n': // payee_pubkey (33 bytes)
        if (fieldData.length === 53) {
          result.payeeNodeKey = wordsToBuffer(fieldData, 5, 8, false).toString('hex');
        }
        break;

      case 'x': // expiry
        result.expiry = fieldData.reduce((acc, v) => acc * 32 + v, 0);
        break;

      case 'c': // min_final_cltv_expiry
        result.minFinalCltvExpiry = fieldData.reduce((acc, v) => acc * 32 + v, 0);
        break;

      case '9': // features
        result.features = wordsToBuffer(fieldData, 5, 8, true).toString('hex');
        break;

      // Additional tags: r (route hints), s (payment_secret), etc.
      default:
        break;
    }
  }

  // Compute expiration
  if (result.timestamp) {
    result.expiresAt = result.timestamp + result.expiry;
    result.expired = result.expiresAt < Math.floor(Date.now() / 1000);
  }

  return result;
}

// ─── BOLT12 Offer Decoder ───────────────────────

/**
 * Decode a BOLT12 offer (lno...) or invoice request (lni...).
 * BOLT12 uses TLV (Type-Length-Value) encoding in bech32m.
 */
export function decodeBolt12(offerStr) {
  if (!offerStr || typeof offerStr !== 'string') {
    throw new Error('Invalid offer string');
  }

  const cleaned = offerStr.toLowerCase().trim();

  let type;
  if (cleaned.startsWith('lno')) type = 'offer';
  else if (cleaned.startsWith('lni')) type = 'invoice_request';
  else throw new Error('Not a BOLT12 offer/invoice_request (must start with "lno" or "lni")');

  // For now, return basic parsed info
  // Full TLV parsing requires significant implementation
  const result = {
    type: `bolt12_${type}`,
    raw: offerStr,
    // Extract what we can from the bech32 data
    description: null,
    amountSats: null,
    nodeId: null,
    features: null,
  };

  try {
    const { data } = bech32Decode(cleaned);
    const bytes = wordsToBuffer(data, 5, 8, true);

    // Parse TLV stream
    let offset = 0;
    while (offset < bytes.length - 2) {
      // TLV: type (bigsize), length (bigsize), value
      const tlvType = readBigSize(bytes, offset);
      if (tlvType === null) break;
      offset += bigSizeLen(bytes, offset);

      const tlvLen = readBigSize(bytes, offset);
      if (tlvLen === null) break;
      offset += bigSizeLen(bytes, offset);

      if (offset + tlvLen > bytes.length) break;
      const value = bytes.slice(offset, offset + tlvLen);
      offset += tlvLen;

      // Known BOLT12 TLV types
      switch (tlvType) {
        case 10: // amount (msat)
          if (value.length <= 8) {
            let msat = 0n;
            for (let i = 0; i < value.length; i++) {
              msat = (msat << 8n) | BigInt(value[i]);
            }
            result.amountSats = Number(msat / 1000n);
          }
          break;
        case 12: // description
          result.description = value.toString('utf8');
          break;
        case 22: // node_id (33 bytes)
          if (value.length === 33) {
            result.nodeId = value.toString('hex');
          }
          break;
        case 24: // quantity_max
          break;
        default:
          break;
      }
    }
  } catch {
    // Partial decode is okay
  }

  return result;
}

function readBigSize(buf, offset) {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if (first < 0xfd) return first;
  if (first === 0xfd && offset + 2 < buf.length) {
    return buf.readUInt16BE(offset + 1);
  }
  if (first === 0xfe && offset + 4 < buf.length) {
    return buf.readUInt32BE(offset + 1);
  }
  return null;
}

function bigSizeLen(buf, offset) {
  if (offset >= buf.length) return 1;
  const first = buf[offset];
  if (first < 0xfd) return 1;
  if (first === 0xfd) return 3;
  if (first === 0xfe) return 5;
  return 9;
}

// ─── Invoice Detection ──────────────────────────

/**
 * Detect if a string is a Lightning invoice/offer.
 */
export function detectLightningPayment(input) {
  if (!input || typeof input !== 'string') return null;
  const lower = input.toLowerCase().replace(/^lightning:/i, '').trim();

  if (lower.startsWith('lnbc') || lower.startsWith('lntb') || lower.startsWith('lnbcrt') || lower.startsWith('lntbs')) {
    return { type: 'bolt11', invoice: input };
  }
  if (lower.startsWith('lno')) {
    return { type: 'bolt12_offer', offer: input };
  }
  if (lower.startsWith('lni')) {
    return { type: 'bolt12_invoice_request', invoiceRequest: input };
  }
  return null;
}

/**
 * Decode any Lightning payment string (BOLT11 or BOLT12).
 */
export function decodeLightning(input) {
  const detected = detectLightningPayment(input);
  if (!detected) throw new Error('Not a recognized Lightning payment string');

  if (detected.type === 'bolt11') {
    return decodeBolt11(input);
  }
  return decodeBolt12(input);
}
