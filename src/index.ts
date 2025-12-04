/**
 * Clavis - TypeScript implementation
 * Secure encrypted communication over asynchronous streams
 * 
 * @packageDocumentation
 */

// Core modules
export * from "./error.js";
export * from "./crypto.js";
export * from "./handshake.js";
export * from "./stream.js";
export * from "./protocol.js";
export * from "./bincode.js";
export * from "./bincode-helpers.js";
export * from "./client.js";

// ============================================================================
// Re-exported types for convenience
// ============================================================================

// Error types
export type {
  ClavisError,
  CryptoError,
  MessageError,
  StreamError,
} from "./error.js";

export {
  CryptoOperation,
  StreamErrorCode,
} from "./error.js";

// Stream types
export type {
  EncryptedStreamOptions,
  SplitResult,
} from "./stream.js";

export {
  EncryptedStream,
  EncryptedReader,
  EncryptedWriter,
} from "./stream.js";

// Protocol types
export type {
  PacketTrait,
  DecodedMessage,
  ProtocolCodec,
} from "./protocol.js";

export {
  protocol,
  createProtocolCodec,
} from "./protocol.js";

// Bincode types
export type {
  ReadResult,
} from "./bincode.js";

export {
  BincodeReader,
} from "./bincode.js";

// Handshake types
export type {
  HandshakeResult,
} from "./handshake.js";

// Client types
export type {
  ClavisClientOptions,
  ClavisClientEvents,
  ConnectionStatus,
  ReconnectOptions,
} from "./client.js";

export {
  ClavisClient,
} from "./client.js";

// Crypto types
export type {
  X25519KeyPair,
} from "./crypto.js";

export {
  XChaCha20Poly1305Cipher,
  generateX25519KeyPair,
  computeSharedSecret,
  sha256Hash,
  hmacSha256,
  hkdfExpand,
  generateRandomBytes,
} from "./crypto.js";
