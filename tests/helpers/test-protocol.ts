/**
 * Test protocol definition matching Rust examples
 * This protocol is used for both same-language and cross-language tests
 */

import type { PacketTrait } from "../../src/protocol.js";

/**
 * Ping/Pong data structure
 */
export interface PingPongData {
  message: string;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  username: string;
  content: string;
  timestamp: number;
}

/**
 * Status structure
 */
export interface Status {
  users_online: number;
  server_uptime: number;
}

/**
 * Test protocol enum matching Rust's protocol! macro output
 * This uses a simplified serialization for now
 */
export class TestProtocol implements PacketTrait {
  constructor(
    public variantIndex: number,
    public variantName: string,
    public variantData?: any
  ) {}

  serialize(): Uint8Array {
    // Serialize as bincode enum: variant index (u32) + variant data
    const buffer: number[] = [];
    
    // Write variant index (u32 little-endian)
    buffer.push(this.variantIndex & 0xff);
    buffer.push((this.variantIndex >> 8) & 0xff);
    buffer.push((this.variantIndex >> 16) & 0xff);
    buffer.push((this.variantIndex >> 24) & 0xff);
    
    // Write variant data if present
    if (this.variantData !== undefined) {
      const dataBytes = this.serializeVariantData(this.variantData);
      buffer.push(...dataBytes);
    }
    
    return new Uint8Array(buffer);
  }

  private serializeVariantData(data: any): number[] {
    const buffer: number[] = [];
    
    if (typeof data === "string") {
      // String: length (u64) + bytes
      const bytes = new TextEncoder().encode(data);
      const len = BigInt(bytes.length);
      // u64 little-endian
      const low = Number(len & 0xffffffffn);
      const high = Number((len >> 32n) & 0xffffffffn);
      buffer.push(low & 0xff, (low >> 8) & 0xff, (low >> 16) & 0xff, (low >> 24) & 0xff);
      buffer.push(high & 0xff, (high >> 8) & 0xff, (high >> 16) & 0xff, (high >> 24) & 0xff);
      buffer.push(...bytes);
    } else if (typeof data === "object" && data !== null) {
      // Object: serialize fields in order
      if (data.message !== undefined) {
        // PingPongData
        const msgBytes = this.serializeVariantData(data.message);
        buffer.push(...msgBytes);
      } else if (data.username !== undefined) {
        // ChatMessage: username, content, timestamp
        buffer.push(...this.serializeVariantData(data.username));
        buffer.push(...this.serializeVariantData(data.content));
        // timestamp as u64
        const ts = BigInt(data.timestamp);
        const low = Number(ts & 0xffffffffn);
        const high = Number((ts >> 32n) & 0xffffffffn);
        buffer.push(low & 0xff, (low >> 8) & 0xff, (low >> 16) & 0xff, (low >> 24) & 0xff);
        buffer.push(high & 0xff, (high >> 8) & 0xff, (high >> 16) & 0xff, (high >> 24) & 0xff);
      } else if (data.users_online !== undefined) {
        // Status: users_online (u32), server_uptime (u64)
        const uo = data.users_online;
        buffer.push(uo & 0xff, (uo >> 8) & 0xff, (uo >> 16) & 0xff, (uo >> 24) & 0xff);
        const su = BigInt(data.server_uptime);
        const low = Number(su & 0xffffffffn);
        const high = Number((su >> 32n) & 0xffffffffn);
        buffer.push(low & 0xff, (low >> 8) & 0xff, (low >> 16) & 0xff, (low >> 24) & 0xff);
        buffer.push(high & 0xff, (high >> 8) & 0xff, (high >> 16) & 0xff, (high >> 24) & 0xff);
      }
    }
    
    return buffer;
  }

  deserialize(_data: Uint8Array): this {
    // Deserialization will be handled by protocol helper
    throw new Error("Deserialization not implemented in test protocol");
  }

  // Static factory methods
  static Heartbeat(): TestProtocol {
    return new TestProtocol(0, "Heartbeat");
  }

  static Join(username: string): TestProtocol {
    return new TestProtocol(1, "Join", username);
  }

  static Leave(username: string): TestProtocol {
    return new TestProtocol(2, "Leave", username);
  }

  static Message(message: ChatMessage): TestProtocol {
    return new TestProtocol(3, "Message", message);
  }

  static Status(status: Status): TestProtocol {
    return new TestProtocol(4, "Status", status);
  }

  static Ping(data: PingPongData): TestProtocol {
    return new TestProtocol(5, "Ping", data);
  }

  static Pong(data: PingPongData): TestProtocol {
    return new TestProtocol(6, "Pong", data);
  }

  static Shutdown(): TestProtocol {
    return new TestProtocol(7, "Shutdown");
  }
}

// Export type alias
export type Packet = TestProtocol;

