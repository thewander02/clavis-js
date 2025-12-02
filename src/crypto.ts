import { x25519 } from "@noble/curves/x25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { ClavisError, CryptoError, CryptoOperation } from "./error.js";

/**
 * X25519 key pair for key exchange
 */
export interface X25519KeyPair {
  secret: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // 32 bytes
}

/**
 * Generate a new X25519 key pair
 */
export function generateX25519KeyPair(): X25519KeyPair {
  const { secretKey, publicKey } = x25519.keygen();
  return { secret: secretKey, publicKey };
}

/**
 * Compute shared secret from our secret key and peer's public key
 */
export function computeSharedSecret(
  secretKey: Uint8Array,
  peerPublicKey: Uint8Array
): Uint8Array {
  if (secretKey.length !== 32) {
    throw ClavisError.crypto(
      CryptoError.invalidKeyMaterial("Secret key must be 32 bytes")
    );
  }
  if (peerPublicKey.length !== 32) {
    throw ClavisError.crypto(
      CryptoError.invalidKeyMaterial("Public key must be 32 bytes")
    );
  }

  try {
    return x25519.getSharedSecret(secretKey, peerPublicKey);
  } catch (error) {
    throw ClavisError.cryptoFailure(
      CryptoOperation.KeyExchange,
      `Failed to compute shared secret: ${error}`
    );
  }
}

/**
 * XChaCha20-Poly1305 cipher instance
 */
export class XChaCha20Poly1305Cipher {
  private key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.length !== 32) {
      throw ClavisError.crypto(
        CryptoError.invalidKeyMaterial("Key must be 32 bytes for XChaCha20-Poly1305")
      );
    }
    this.key = key;
  }

  /**
   * Generate a random 24-byte nonce
   */
  static generateNonce(): Uint8Array {
    return randomBytes(24);
  }

  /**
   * Encrypt plaintext with a nonce
   */
  encrypt(nonce: Uint8Array, plaintext: Uint8Array): Uint8Array {
    if (nonce.length !== 24) {
      throw ClavisError.cryptoFailure(
        CryptoOperation.Encryption,
        "Nonce must be 24 bytes"
      );
    }

    try {
      const cipher = xchacha20poly1305(this.key, nonce);
      return cipher.encrypt(plaintext);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw ClavisError.cryptoFailure(
        CryptoOperation.Encryption,
        `Encryption failed: ${message}`
      );
    }
  }

  /**
   * Decrypt ciphertext with a nonce
   */
  decrypt(nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    if (nonce.length !== 24) {
      throw ClavisError.cryptoFailure(
        CryptoOperation.Decryption,
        "Nonce must be 24 bytes"
      );
    }

    try {
      const cipher = xchacha20poly1305(this.key, nonce);
      return cipher.decrypt(ciphertext);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw ClavisError.cryptoFailure(
        CryptoOperation.Decryption,
        `Decryption failed: ${message}`
      );
    }
  }
}

/**
 * Compute SHA256 hash
 */
export function sha256Hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Compute HMAC-SHA256
 */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  try {
    return hmac(sha256, key, data);
  } catch (error) {
    throw ClavisError.cryptoFailure(
      CryptoOperation.Authentication,
      `HMAC-SHA256 failed: ${error}`
    );
  }
}

/**
 * Derive keys using HKDF-SHA256
 * @param sharedSecret - The shared secret (32 bytes)
 * @param salt - The salt (32 bytes, typically transcript hash)
 * @param info - The info parameter (e.g., "enc" or "dec")
 * @returns Derived key (32 bytes)
 */
export function hkdfExpand(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: string
): Uint8Array {
  if (sharedSecret.length !== 32) {
    throw ClavisError.crypto(
      CryptoError.invalidKeyMaterial("Shared secret must be 32 bytes")
    );
  }
  if (salt.length !== 32) {
    throw ClavisError.crypto(
      CryptoError.invalidKeyMaterial("Salt must be 32 bytes")
    );
  }

  try {
    const derived = hkdf(sha256, sharedSecret, salt, new TextEncoder().encode(info), 32);
    return derived;
  } catch (error) {
    throw ClavisError.crypto(
      CryptoError.keyDerivationFailure(`HKDF expansion failed: ${error}`)
    );
  }
}

/**
 * Generate random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  return randomBytes(length);
}
