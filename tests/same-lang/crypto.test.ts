/**
 * Crypto tests - XChaCha20-Poly1305, X25519, HKDF, etc.
 */

import { describe, test, expect } from "bun:test";
import {
  XChaCha20Poly1305Cipher,
  generateX25519KeyPair,
  computeSharedSecret,
  sha256Hash,
  hmacSha256,
  hkdfExpand,
  generateRandomBytes,
} from "../../src/crypto.js";

describe("Crypto", () => {
  describe("XChaCha20-Poly1305", () => {
    test("should encrypt and decrypt data", () => {
      const key = generateRandomBytes(32);
      const cipher = new XChaCha20Poly1305Cipher(key);
      const nonce = XChaCha20Poly1305Cipher.generateNonce();
      const plaintext = new TextEncoder().encode("Hello, World!");

      const ciphertext = cipher.encrypt(nonce, plaintext);
      expect(ciphertext).not.toEqual(plaintext);
      expect(ciphertext.length).toBeGreaterThan(plaintext.length); // Includes auth tag

      const decrypted = cipher.decrypt(nonce, ciphertext);
      expect(decrypted).toEqual(plaintext);
    });

    test("should generate unique nonces", () => {
      const nonce1 = XChaCha20Poly1305Cipher.generateNonce();
      const nonce2 = XChaCha20Poly1305Cipher.generateNonce();

      expect(nonce1.length).toBe(24);
      expect(nonce2.length).toBe(24);
      expect(nonce1).not.toEqual(nonce2);
    });

    test("should fail with wrong nonce", () => {
      const key = generateRandomBytes(32);
      const cipher = new XChaCha20Poly1305Cipher(key);
      const nonce = XChaCha20Poly1305Cipher.generateNonce();
      const plaintext = new TextEncoder().encode("test");

      const ciphertext = cipher.encrypt(nonce, plaintext);
      const wrongNonce = generateRandomBytes(24);

      expect(() => {
        cipher.decrypt(wrongNonce, ciphertext);
      }).toThrow();
    });

    test("should fail with wrong key", () => {
      const key1 = generateRandomBytes(32);
      const key2 = generateRandomBytes(32);
      const cipher1 = new XChaCha20Poly1305Cipher(key1);
      const cipher2 = new XChaCha20Poly1305Cipher(key2);
      const nonce = XChaCha20Poly1305Cipher.generateNonce();
      const plaintext = new TextEncoder().encode("test");

      const ciphertext = cipher1.encrypt(nonce, plaintext);

      expect(() => {
        cipher2.decrypt(nonce, ciphertext);
      }).toThrow();
    });

    test("should handle empty plaintext", () => {
      const key = generateRandomBytes(32);
      const cipher = new XChaCha20Poly1305Cipher(key);
      const nonce = XChaCha20Poly1305Cipher.generateNonce();
      const plaintext = new Uint8Array(0);

      const ciphertext = cipher.encrypt(nonce, plaintext);
      const decrypted = cipher.decrypt(nonce, ciphertext);

      expect(decrypted).toEqual(plaintext);
    });

    test("should handle large plaintext", () => {
      const key = generateRandomBytes(32);
      const cipher = new XChaCha20Poly1305Cipher(key);
      const nonce = XChaCha20Poly1305Cipher.generateNonce();
      const plaintext = generateRandomBytes(10000);

      const ciphertext = cipher.encrypt(nonce, plaintext);
      const decrypted = cipher.decrypt(nonce, ciphertext);

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe("X25519 Key Exchange", () => {
    test("should generate key pairs", () => {
      const keyPair = generateX25519KeyPair();

      expect(keyPair.secret.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    test("should compute shared secret", () => {
      const alice = generateX25519KeyPair();
      const bob = generateX25519KeyPair();

      const aliceShared = computeSharedSecret(alice.secret, bob.publicKey);
      const bobShared = computeSharedSecret(bob.secret, alice.publicKey);

      expect(aliceShared).toEqual(bobShared);
      expect(aliceShared.length).toBe(32);
    });

    test("should generate different shared secrets for different peers", () => {
      const alice = generateX25519KeyPair();
      const bob = generateX25519KeyPair();
      const charlie = generateX25519KeyPair();

      const aliceBob = computeSharedSecret(alice.secret, bob.publicKey);
      const aliceCharlie = computeSharedSecret(alice.secret, charlie.publicKey);

      expect(aliceBob).not.toEqual(aliceCharlie);
    });
  });

  describe("SHA256", () => {
    test("should hash data", () => {
      const data = new TextEncoder().encode("test");
      const hash = sha256Hash(data);

      expect(hash.length).toBe(32);
    });

    test("should produce consistent hashes", () => {
      const data = new TextEncoder().encode("test");
      const hash1 = sha256Hash(data);
      const hash2 = sha256Hash(data);

      expect(hash1).toEqual(hash2);
    });

    test("should produce different hashes for different data", () => {
      const data1 = new TextEncoder().encode("test1");
      const data2 = new TextEncoder().encode("test2");
      const hash1 = sha256Hash(data1);
      const hash2 = sha256Hash(data2);

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe("HMAC-SHA256", () => {
    test("should compute HMAC", () => {
      const key = generateRandomBytes(32);
      const data = new TextEncoder().encode("test");
      const mac = hmacSha256(key, data);

      expect(mac.length).toBe(32);
    });

    test("should produce consistent MACs", () => {
      const key = generateRandomBytes(32);
      const data = new TextEncoder().encode("test");
      const mac1 = hmacSha256(key, data);
      const mac2 = hmacSha256(key, data);

      expect(mac1).toEqual(mac2);
    });

    test("should produce different MACs for different keys", () => {
      const key1 = generateRandomBytes(32);
      const key2 = generateRandomBytes(32);
      const data = new TextEncoder().encode("test");
      const mac1 = hmacSha256(key1, data);
      const mac2 = hmacSha256(key2, data);

      expect(mac1).not.toEqual(mac2);
    });
  });

  describe("HKDF", () => {
    test("should derive keys", () => {
      const sharedSecret = generateRandomBytes(32);
      const salt = generateRandomBytes(32);
      const key1 = hkdfExpand(sharedSecret, salt, "enc");
      const key2 = hkdfExpand(sharedSecret, salt, "dec");

      expect(key1.length).toBe(32);
      expect(key2.length).toBe(32);
      expect(key1).not.toEqual(key2);
    });

    test("should produce consistent keys", () => {
      const sharedSecret = generateRandomBytes(32);
      const salt = generateRandomBytes(32);
      const key1 = hkdfExpand(sharedSecret, salt, "enc");
      const key2 = hkdfExpand(sharedSecret, salt, "enc");

      expect(key1).toEqual(key2);
    });

    test("should produce different keys for different info", () => {
      const sharedSecret = generateRandomBytes(32);
      const salt = generateRandomBytes(32);
      const key1 = hkdfExpand(sharedSecret, salt, "enc");
      const key2 = hkdfExpand(sharedSecret, salt, "dec");

      expect(key1).not.toEqual(key2);
    });
  });
});

