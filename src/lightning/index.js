/**
 * DARKSOL Lightning — Module Entry Point
 * Exports all Lightning functionality for integration with the terminal.
 */

// Core
export { getNode, resetNode, LdkNode, NodeState, parsePeerAddr } from './node.js';

// Configuration
export { getLightningConfig, setLightningConfig, validateConfig, getDataDir, LIGHTNING_DEFAULTS } from './config.js';

// Key Management
export {
  generateMnemonic, validateMnemonic, deriveLdkSeed, deriveBip39Seed,
  seedToNodeId, storeMnemonic, storeSeed, loadMnemonic, loadSeed,
  hasMnemonic, hasSeed,
} from './keys.js';

// Chain Source
export { EsploraClient, createEsploraClient } from './esplora.js';

// Persistence
export { LightningStore, createStore } from './persistence.js';

// Invoice Codec
export { decodeBolt11, decodeBolt12, detectLightningPayment, decodeLightning } from './bolt11.js';

// Events
export { lightningEvents, LnEvent } from './events.js';

// LSP
export { LspClient, LSP_PROVIDERS, createLspClient } from './lsp.js';

// CLI Commands
export {
  lightningInit,
  lightningStart,
  lightningStop,
  lightningInfo,
  lightningBalance,
  lightningPay,
  lightningInvoice,
  lightningOffer,
  lightningDecode,
  lightningChannels,
  lightningOpen,
  lightningClose,
  lightningPeers,
  lightningConnect,
  lightningLiquidity,
  lightningJitChannel,
  lightningHistory,
} from './commands.js';
