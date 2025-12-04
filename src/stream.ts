/**
 * Encrypted stream implementation
 * Provides encrypted packet-based communication over Node.js streams
 */

import { XChaCha20Poly1305Cipher } from "./crypto.js";
import { ClavisError, MessageError } from "./error.js";
import { performHandshake } from "./handshake.js";
import type { HandshakeResult } from "./handshake.js";
import type { PacketTrait } from "./protocol.js";
import { Readable, Writable } from "stream";

/**
 * Options for configuring an encrypted stream
 */
export interface EncryptedStreamOptions {
  /** Maximum packet size in bytes (default: 65536) */
  maxPacketSize?: number | undefined;
  /** 
   * Pre-shared key for authentication (optional).
   * Can be provided as:
   * - Uint8Array: Used directly
   * - string: Auto-detected as base64 or UTF-8
   */
  psk?: string | Uint8Array | undefined;
}

/** Internal options with normalized PSK */
interface NormalizedOptions {
  maxPacketSize: number;
  psk: Uint8Array | undefined;
}

/**
 * Normalize PSK from string or Uint8Array to Uint8Array.
 * For strings, attempts base64 decode first, then falls back to UTF-8.
 */
function normalizePsk(psk: string | Uint8Array | undefined): Uint8Array | undefined {
  if (!psk) return undefined;
  if (psk instanceof Uint8Array) return psk;
  
  // Try base64 decode first
  try {
    const decoded = Buffer.from(psk, 'base64');
    // Verify it's valid base64 by re-encoding and comparing
    if (decoded.toString('base64') === psk) {
      return new Uint8Array(decoded);
    }
  } catch {
    // Not valid base64, fall through
  }
  
  // Fall back to UTF-8 encoding
  return new Uint8Array(Buffer.from(psk, 'utf-8'));
}

/**
 * Result of splitting an encrypted stream
 */
export interface SplitResult {
  reader: EncryptedReader;
  writer: EncryptedWriter;
}

const DEFAULT_MAX_PACKET_SIZE = 65536;

/**
 * Stream adapter for reading/writing
 */
interface StreamAdapter {
  read(length: number): Promise<Uint8Array>;
  write(data: Uint8Array): Promise<void>;
  readU32LE(): Promise<number>;
  writeU32LE(value: number): Promise<void>;
}

/**
 * Create a stream adapter from a Node.js stream
 */
function createStreamAdapter(stream: Readable & Writable): StreamAdapter {
  const readBuffer: Uint8Array[] = [];
  let readResolver: ((value: Uint8Array) => void) | null = null;
  let readRejecter: ((error: Error) => void) | null = null;
  let readLength: number | null = null;

  const adapter: StreamAdapter = {
    async read(length: number): Promise<Uint8Array> {
      // Check if we have enough data in buffer
      let totalBuffered = readBuffer.reduce((sum, buf) => sum + buf.length, 0);
      
      if (totalBuffered >= length) {
        // We have enough data, extract it
        const result = new Uint8Array(length);
        let offset = 0;
        while (offset < length && readBuffer.length > 0) {
          const buf = readBuffer[0]!;
          const toTake = Math.min(buf.length, length - offset);
          result.set(buf.slice(0, toTake), offset);
          offset += toTake;
          
          if (toTake === buf.length) {
            readBuffer.shift();
          } else {
            readBuffer[0] = buf.slice(toTake);
          }
        }
        return result;
      }
      
      // Need to wait for more data
      return new Promise((resolve, reject) => {
        readLength = length;
        readResolver = resolve;
        readRejecter = reject;
        
        // Check again in case data arrived between check and setting resolver
        totalBuffered = readBuffer.reduce((sum, buf) => sum + buf.length, 0);
        if (totalBuffered >= length) {
          // Data arrived, process it
          readLength = null;
          const resolver = readResolver;
          readResolver = null;
          readRejecter = null;
          adapter.read(length).then(resolver!).catch(reject);
        }
      });
    },

    async write(data: Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        stream.write(Buffer.from(data), (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    async readU32LE(): Promise<number> {
      const bytes = await adapter.read(4);
      // Ensure unsigned 32-bit integer
      const value = bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24);
      return value >>> 0; // Convert to unsigned
    },

    async writeU32LE(value: number): Promise<void> {
      const bytes = new Uint8Array(4);
      bytes[0] = value & 0xff;
      bytes[1] = (value >> 8) & 0xff;
      bytes[2] = (value >> 16) & 0xff;
      bytes[3] = (value >> 24) & 0xff;
      await adapter.write(bytes);
    },
  };

  // Handle incoming data
  stream.on("data", (chunk: Buffer) => {
    const data = new Uint8Array(chunk);
    if (readResolver && readLength !== null) {
      readBuffer.push(data);
      const totalBuffered = readBuffer.reduce((sum, buf) => sum + buf.length, 0);
      
      if (totalBuffered >= readLength) {
        // We have enough data
        const result = new Uint8Array(readLength);
        let offset = 0;
        while (offset < readLength && readBuffer.length > 0) {
          const buf = readBuffer[0]!;
          const toTake = Math.min(buf.length, readLength - offset);
          result.set(buf.slice(0, toTake), offset);
          offset += toTake;
          
          if (toTake === buf.length) {
            readBuffer.shift();
          } else {
            readBuffer[0] = buf.slice(toTake);
          }
        }
        
        const resolver = readResolver;
        readResolver = null;
        readRejecter = null;
        readLength = null;
        resolver(result);
      }
    } else {
      readBuffer.push(data);
    }
  });

  stream.on("error", (err) => {
    if (readRejecter) {
      const rejecter = readRejecter;
      readResolver = null;
      readRejecter = null;
      readLength = null;
      rejecter(err);
    }
  });

  return adapter;
}

/**
 * Encrypted stream for reading and writing encrypted packets
 */
export class EncryptedStream {
  private cipher: XChaCha20Poly1305Cipher;
  private decipher: XChaCha20Poly1305Cipher;
  protected adapter: StreamAdapter;
  private options: NormalizedOptions;

  protected constructor(
    handshakeResult: HandshakeResult,
    options: NormalizedOptions
  ) {
    // Adapter will be set by the new() method
    this.adapter = null as unknown as StreamAdapter; // Temporary, will be set
    this.cipher = new XChaCha20Poly1305Cipher(handshakeResult.encKey);
    this.decipher = new XChaCha20Poly1305Cipher(handshakeResult.decKey);
    this.options = options;
  }

  /**
   * Create a new encrypted stream by performing handshake
   * 
   * @param stream - Node.js duplex stream (e.g., TCP socket)
   * @param options - Configuration options including optional PSK
   */
  static async new(
    stream: Readable & Writable,
    options?: EncryptedStreamOptions
  ): Promise<EncryptedStream> {
    // Normalize options
    const normalizedOpts: NormalizedOptions = {
      maxPacketSize: options?.maxPacketSize ?? DEFAULT_MAX_PACKET_SIZE,
      psk: normalizePsk(options?.psk),
    };

    // Create adapter and perform handshake
    const adapter = createStreamAdapter(stream);
    const handshakeResult = await performHandshake(adapter, normalizedOpts.psk);

    // Create the encrypted stream with the same adapter
    const encryptedStream = new EncryptedStream(handshakeResult, normalizedOpts);
    encryptedStream.adapter = adapter; // Use the same adapter

    return encryptedStream;
  }

  /**
   * Read an encrypted packet from the stream
   */
  async readPacket<P extends PacketTrait>(): Promise<P> {
    // Read length (u32 little-endian)
    const length = await this.adapter.readU32LE();
    
    if (length <= 0 || length > this.options.maxPacketSize) {
      throw ClavisError.message(
        MessageError.messageTooLarge(length, this.options.maxPacketSize)
      );
    }

    // Read nonce (24 bytes)
    const nonce = await this.adapter.read(24);

    // Read ciphertext
    const ciphertext = await this.adapter.read(length);

    // Decrypt
    const plaintext = this.decipher.decrypt(nonce, ciphertext);

    // Deserialize packet (this will be handled by the protocol)
    // For now, return as unknown - actual deserialization needs protocol definition
    return plaintext as unknown as P;
  }

  /**
   * Write an encrypted packet to the stream
   */
  async writePacket(packet: PacketTrait): Promise<void> {
    // Serialize packet
    const plaintext = packet.serialize();

    if (plaintext.length > this.options.maxPacketSize) {
      throw ClavisError.message(
        MessageError.messageTooLarge(plaintext.length, this.options.maxPacketSize)
      );
    }

    // Encrypt
    const nonce = XChaCha20Poly1305Cipher.generateNonce();
    const ciphertext = this.cipher.encrypt(nonce, plaintext);

    // Write length (u32 little-endian)
    await this.adapter.writeU32LE(ciphertext.length);

    // Write nonce
    await this.adapter.write(nonce);

    // Write ciphertext
    await this.adapter.write(ciphertext);
  }

  /**
   * Split the stream into separate reader and writer.
   * Returns an object with `reader` and `writer` properties.
   * 
   * @example
   * ```typescript
   * const { reader, writer } = stream.split();
   * await writer.writePacket(message);
   * const response = await reader.readPacket();
   * ```
   */
  split(): SplitResult {
    // For Node.js streams, we can't truly split like Rust's ReadHalf/WriteHalf
    // Instead, we'll create reader/writer that share the same underlying stream
    // but enforce read-only/write-only semantics
    return {
      reader: new EncryptedReader(this.adapter, this.decipher, this.options),
      writer: new EncryptedWriter(this.adapter, this.cipher, this.options),
    };
  }
}

/**
 * Encrypted reader (read-only half of a split stream)
 */
export class EncryptedReader {
  constructor(
    private adapter: StreamAdapter,
    private decipher: XChaCha20Poly1305Cipher,
    private options: NormalizedOptions
  ) {}

  /**
   * Read and decrypt the next packet from the stream.
   * Returns the decrypted packet data.
   */
  async readPacket<P extends PacketTrait>(): Promise<P> {
    const length = await this.adapter.readU32LE();
    
    if (length <= 0 || length > this.options.maxPacketSize) {
      throw ClavisError.message(
        MessageError.messageTooLarge(length, this.options.maxPacketSize)
      );
    }

    const nonce = await this.adapter.read(24);
    const ciphertext = await this.adapter.read(length);
    const plaintext = this.decipher.decrypt(nonce, ciphertext);

    return plaintext as unknown as P;
  }
}

/**
 * Encrypted writer (write-only half of a split stream)
 */
export class EncryptedWriter {
  constructor(
    private adapter: StreamAdapter,
    private cipher: XChaCha20Poly1305Cipher,
    private options: NormalizedOptions
  ) {}

  /**
   * Encrypt and write a packet to the stream.
   * @param packet - Object implementing PacketTrait with a serialize() method
   */
  async writePacket(packet: PacketTrait): Promise<void> {
    const plaintext = packet.serialize();

    if (plaintext.length > this.options.maxPacketSize) {
      throw ClavisError.message(
        MessageError.messageTooLarge(plaintext.length, this.options.maxPacketSize)
      );
    }

    const nonce = XChaCha20Poly1305Cipher.generateNonce();
    const ciphertext = this.cipher.encrypt(nonce, plaintext);

    await this.adapter.writeU32LE(ciphertext.length);
    await this.adapter.write(nonce);
    await this.adapter.write(ciphertext);
  }
}
