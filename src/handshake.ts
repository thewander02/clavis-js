/**
 * Handshake protocol implementation
 * Matches Rust clavis handshake protocol exactly
 */

import {
  generateX25519KeyPair,
  computeSharedSecret,
  sha256Hash,
  hmacSha256,
  hkdfExpand,
  generateRandomBytes,
} from "./crypto.js";
import { ClavisError, CryptoError } from "./error.js";

export interface HandshakeResult {
  encKey: Uint8Array; // 32 bytes encryption key
  decKey: Uint8Array; // 32 bytes decryption key
}

/**
 * Determine role (initiator/responder) by comparing nonces
 * Returns true if we are the initiator (our nonce > peer nonce)
 * Uses lexicographic comparison (same as Rust's byte array comparison)
 */
function compareNonces(localNonce: Uint8Array, peerNonce: Uint8Array): boolean {
  if (localNonce.length !== 32 || peerNonce.length !== 32) {
    throw ClavisError.crypto(CryptoError.invalidKeyMaterial("Nonces must be 32 bytes"));
  }
  
  // Lexicographic comparison (from index 0 to 31, like Rust's Ord for [u8])
  for (let i = 0; i < 32; i++) {
    const local = localNonce[i]!;
    const peer = peerNonce[i]!;
    if (local > peer) {
      return true; // We are initiator
    } else if (local < peer) {
      return false; // We are responder
    }
  }
  return false; // Equal (shouldn't happen with random nonces)
}

/**
 * Construct transcript with initiator's key first, then responder's key
 * This ensures both sides compute the MAC over the same data regardless of role
 */
function constructTranscript(
  initiatorKey: Uint8Array,
  responderKey: Uint8Array
): Uint8Array {
  const transcriptData = new Uint8Array(64);
  transcriptData.set(initiatorKey, 0);
  transcriptData.set(responderKey, 32);
  return transcriptData;
}

/**
 * Perform handshake to establish encrypted connection
 * @param stream - The stream to perform handshake on
 * @param psk - Optional pre-shared key for authentication
 * @returns Handshake result with encryption/decryption keys
 */
export async function performHandshake(
  stream: {
    read: (length: number) => Promise<Uint8Array>;
    write: (data: Uint8Array) => Promise<void>;
  },
  psk?: Uint8Array
): Promise<HandshakeResult> {
  // Validate PSK if provided
  if (psk && psk.length < 16) {
    throw ClavisError.crypto(
      CryptoError.invalidKeyMaterial("Pre-shared key must be at least 16 bytes")
    );
  }

  // Step 1: Nonce exchange to determine role
  const localNonce = generateRandomBytes(32);
  await stream.write(localNonce);
  
  const peerNonce = await stream.read(32);
  const isInitiator = compareNonces(localNonce, peerNonce);

  // Step 2: X25519 key exchange
  const keyPair = generateX25519KeyPair();
  
  if (isInitiator) {
    // Initiator sends public key first, then receives peer's public key
    await stream.write(keyPair.publicKey);
    const peerPublicKey = await stream.read(32);
    
    const sharedSecret = computeSharedSecret(keyPair.secret, peerPublicKey);
    
    // Step 3: Transcript hashing and MAC (initiator's key first, then responder's)
    const transcriptData = constructTranscript(keyPair.publicKey, peerPublicKey);
    const transcriptHash = sha256Hash(transcriptData);
    
    let mac: Uint8Array | undefined;
    if (psk) {
      mac = hmacSha256(psk, transcriptData);
    }
    
    // Step 4: MAC exchange (if PSK provided)
    if (mac) {
      await stream.write(mac);
      const peerMac = await stream.read(32);
      
      // Verify MACs match
      if (!constantTimeEquals(mac, peerMac)) {
        throw ClavisError.crypto(
          CryptoError.authenticationFailure("MAC verification failed")
        );
      }
    }
    
    // Step 5: Key derivation
    const encKey = hkdfExpand(sharedSecret, transcriptHash, "enc");
    const decKey = hkdfExpand(sharedSecret, transcriptHash, "dec");
    
    return { encKey, decKey };
  } else {
    // Responder receives public key first, then sends own public key
    const peerPublicKey = await stream.read(32);
    await stream.write(keyPair.publicKey);
    
    const sharedSecret = computeSharedSecret(keyPair.secret, peerPublicKey);
    
    // Step 3: Transcript hashing and MAC (initiator's key first, then responder's)
    // peerPublicKey is from initiator, keyPair.publicKey is from responder
    const transcriptData = constructTranscript(peerPublicKey, keyPair.publicKey);
    const transcriptHash = sha256Hash(transcriptData);
    
    let mac: Uint8Array | undefined;
    if (psk) {
      mac = hmacSha256(psk, transcriptData);
    }
    
    // Step 4: MAC exchange (if PSK provided)
    if (mac) {
      const peerMac = await stream.read(32);
      await stream.write(mac);
      
      // Verify MACs match
      if (!constantTimeEquals(mac, peerMac)) {
        throw ClavisError.crypto(
          CryptoError.authenticationFailure("MAC verification failed")
        );
      }
    }
    
    // Step 5: Key derivation (responder uses opposite keys)
    const encKey = hkdfExpand(sharedSecret, transcriptHash, "dec");
    const decKey = hkdfExpand(sharedSecret, transcriptHash, "enc");
    
    return { encKey, decKey };
  }
}

/**
 * Constant-time comparison to prevent timing attacks
 */
function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }

  return result === 0;
}
