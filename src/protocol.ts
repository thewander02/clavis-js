/**
 * Protocol DSL for defining packet types
 * This provides a TypeScript equivalent to Rust's protocol! macro
 * 
 * Usage example:
 * ```typescript
 * interface PingPongData {
 *   message: string;
 * }
 * 
 * const Packet = protocol({
 *   Heartbeat: [],
 *   Join: [String],
 *   Leave: [String],
 *   Message: [{ username: String, content: String, timestamp: Number }],
 *   Status: [{ users_online: Number, server_uptime: Number }],
 *   Ping: [{ message: String }],
 *   Pong: [{ message: String }],
 *   Shutdown: [],
 * });
 * 
 * // Create a packet
 * const ping = Packet.Ping({ message: "hello" });
 * 
 * // Serialize
 * const serialized = ping.serialize();
 * 
 * // Deserialize (requires protocol definition)
 * const deserialized = Packet.deserialize(serialized);
 * ```
 */

import { ClavisError } from "./error.js";
import { writeVarintU32, writeString, writeU32, writeU64, writeI64, writeDateTime } from "./bincode.js";

/**
 * Packet trait interface - types that can be serialized/deserialized
 */
export interface PacketTrait {
  serialize(): Uint8Array;
  deserialize(data: Uint8Array): this;
}

/**
 * Protocol variant definition
 */
interface VariantDef {
  index: number;
  name: string;
  fields?: unknown[];
}

/**
 * Create a protocol enum with serialization support
 * Matches Rust's clavis::protocol! macro behavior
 */
export function protocol(def: Record<string, unknown[]>): unknown {
  const variants: VariantDef[] = [];
  let index = 0;

  for (const [name, fields] of Object.entries(def)) {
    variants.push({
      index: index++,
      name,
      fields,
    });
  }

  // Create a class that represents the protocol
  class ProtocolEnum implements PacketTrait {
    variantIndex: number;
    variantName: string;
    variantData?: unknown;

    constructor(variantIndex: number, variantName: string, variantData?: unknown) {
      this.variantIndex = variantIndex;
      this.variantName = variantName;
      this.variantData = variantData;
    }

    serialize(): Uint8Array {
      const buffer: number[] = [];
      
      // Write variant index using VarintEncoding (matches bincode default)
      // Values < 251 are encoded as a single u8 byte
      writeVarintU32(buffer, this.variantIndex);
      
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
        writeString(buffer, data);
      } else if (typeof data === "number") {
        // Assume u32 for now (can be extended)
        writeU32(buffer, data);
      } else if (typeof data === "bigint") {
        writeU64(buffer, data);
      } else if (data instanceof Date) {
        writeDateTime(buffer, data);
      } else if (Array.isArray(data)) {
        writeU64(buffer, BigInt(data.length));
        for (const item of data) {
          const itemBytes = this.serializeVariantData(item);
          buffer.push(...itemBytes);
        }
      } else if (typeof data === "object" && data !== null) {
        // Object/struct: serialize fields in order
        const keys = Object.keys(data);
        for (const key of keys) {
          const value = data[key];
          if (typeof value === "string") {
            writeString(buffer, value);
          } else if (typeof value === "number") {
            writeU32(buffer, value);
          } else if (typeof value === "bigint") {
            writeU64(buffer, value);
          } else if (value instanceof Date) {
            writeDateTime(buffer, value);
          } else {
            // Recursive serialization for nested objects
            const nestedBytes = this.serializeVariantData(value);
            buffer.push(...nestedBytes);
          }
        }
      }
      
      return buffer;
    }

    deserialize(data: Uint8Array): this {
      // Deserialization will be handled by protocol helper
      throw ClavisError.deserializationFailed("Deserialization not yet fully implemented");
    }
  }

  // Add static factory methods for each variant
  for (const variant of variants) {
    (ProtocolEnum as unknown as Record<string, unknown>)[variant.name] = (...args: unknown[]) => {
      return new ProtocolEnum(variant.index, variant.name, args.length === 1 ? args[0] : args);
    };
  }

  // Add static deserialize method
  (ProtocolEnum as unknown as Record<string, unknown>).deserialize = (_data: Uint8Array): ProtocolEnum => {
    throw ClavisError.deserializationFailed("Deserialization not yet fully implemented");
  };

  return ProtocolEnum;
}
