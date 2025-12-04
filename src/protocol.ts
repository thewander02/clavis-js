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
 * 
 * For simpler use cases, see `createProtocolCodec()` which provides
 * a lightweight codec for encoding/decoding variant indices.
 */

import { ClavisError } from "./error.js";
import { 
  writeVarintU32, 
  writeString, 
  writeU32, 
  writeU64, 
  writeDateTime,
  readVarintU32,
  readU32,
  BincodeReader,
} from "./bincode.js";

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

    deserialize(_data: Uint8Array): this {
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

// ============================================================================
// PROTOCOL CODEC (Lightweight variant index encoder/decoder)
// ============================================================================

/**
 * Decoded message with variant type and raw data
 */
export interface DecodedMessage<T extends string> {
  /** The variant type name */
  type: T;
  /** The variant index */
  index: number;
  /** Raw data after the variant index (for custom deserialization) */
  data: Uint8Array;
  /** BincodeReader positioned after the variant index */
  reader: BincodeReader;
}

/**
 * Protocol codec for encoding/decoding variant indices.
 * This is a lightweight alternative to the full `protocol()` DSL
 * when you need more control over serialization/deserialization.
 * 
 * @example
 * ```typescript
 * // Define your message types
 * type MessageType = 
 *   | 'AgentHello'
 *   | 'ControllerAck'
 *   | 'Heartbeat';
 * 
 * // Create codec with variants in order (must match Rust enum order)
 * const codec = createProtocolCodec<MessageType>([
 *   'AgentHello',
 *   'ControllerAck', 
 *   'Heartbeat',
 * ]);
 * 
 * // Encode a message
 * const bytes = codec.encode('ControllerAck', myData);
 * 
 * // Decode a message
 * const { type, reader } = codec.decode(bytes);
 * if (type === 'ControllerAck') {
 *   const sessionId = reader.readString();
 * }
 * ```
 */
export interface ProtocolCodec<T extends string> {
  /** Get the variant index for a type name */
  variantIndex(type: T): number;
  
  /** Get the type name for a variant index */
  variantName(index: number): T | undefined;
  
  /** Get all variant names in order */
  variants(): readonly T[];
  
  /**
   * Encode a message with variant index prefix.
   * Uses u32 little-endian for variant index (matching clavis::protocol! macro).
   * 
   * @param type - The variant type name
   * @param data - Optional serialized data to append after the variant index
   */
  encode(type: T, data?: Uint8Array): Uint8Array;
  
  /**
   * Decode a message, extracting the variant type and remaining data.
   * Reads u32 little-endian variant index.
   * 
   * @param data - Raw message bytes
   * @returns Decoded message with type, index, remaining data, and a BincodeReader
   */
  decode(data: Uint8Array): DecodedMessage<T>;
  
  /**
   * Check if a variant index is valid
   */
  isValidIndex(index: number): boolean;
  
  /**
   * Check if a type name is valid
   */
  isValidType(type: string): type is T;
}

/**
 * Create a protocol codec for encoding/decoding variant indices.
 * 
 * @param variants - Array of variant names in order (must match Rust enum definition order)
 * @param options - Codec options
 * @returns ProtocolCodec instance
 * 
 * @example
 * ```typescript
 * const MessageCodec = createProtocolCodec([
 *   'AgentHello',
 *   'ControllerAck',
 *   'Heartbeat',
 *   'TaskOffer',
 *   // ... more variants
 * ] as const);
 * 
 * // Encode
 * const buffer: number[] = [];
 * writeU32(buffer, MessageCodec.variantIndex('ControllerAck'));
 * // ... serialize variant data
 * 
 * // Decode
 * const { type, reader } = MessageCodec.decode(data);
 * switch (type) {
 *   case 'ControllerAck':
 *     const sessionId = reader.readString();
 *     break;
 * }
 * ```
 */
export function createProtocolCodec<T extends string>(
  variants: readonly T[],
  options?: {
    /** Use Varint encoding instead of u32 (default: false for clavis::protocol! compatibility) */
    useVarint?: boolean;
  }
): ProtocolCodec<T> {
  const useVarint = options?.useVarint ?? false;
  const nameToIndex = new Map<T, number>();
  const indexToName = new Map<number, T>();
  
  for (let i = 0; i < variants.length; i++) {
    const name = variants[i]!;
    nameToIndex.set(name, i);
    indexToName.set(i, name);
  }
  
  return {
    variantIndex(type: T): number {
      const index = nameToIndex.get(type);
      if (index === undefined) {
        throw ClavisError.serializationFailed(`Unknown variant type: ${type}`);
      }
      return index;
    },
    
    variantName(index: number): T | undefined {
      return indexToName.get(index);
    },
    
    variants(): readonly T[] {
      return variants;
    },
    
    encode(type: T, data?: Uint8Array): Uint8Array {
      const index = nameToIndex.get(type);
      if (index === undefined) {
        throw ClavisError.serializationFailed(`Unknown variant type: ${type}`);
      }
      
      const buffer: number[] = [];
      if (useVarint) {
        writeVarintU32(buffer, index);
      } else {
        // clavis::protocol! macro uses u32 for variant indices
        writeU32(buffer, index);
      }
      
      if (data) {
        buffer.push(...data);
      }
      
      return new Uint8Array(buffer);
    },
    
    decode(data: Uint8Array): DecodedMessage<T> {
      if (data.length < 4) {
        throw ClavisError.deserializationFailed("Data too short to contain variant index");
      }
      
      let index: number;
      let bytesRead: number;
      
      if (useVarint) {
        const result = readVarintU32(data, 0);
        index = result.value;
        bytesRead = result.bytesRead;
      } else {
        const result = readU32(data, 0);
        index = result.value;
        bytesRead = result.bytesRead;
      }
      
      const type = indexToName.get(index);
      if (type === undefined) {
        throw ClavisError.deserializationFailed(`Unknown variant index: ${index}`);
      }
      
      const remainingData = data.slice(bytesRead);
      const reader = new BincodeReader(remainingData);
      
      return {
        type,
        index,
        data: remainingData,
        reader,
      };
    },
    
    isValidIndex(index: number): boolean {
      return indexToName.has(index);
    },
    
    isValidType(type: string): type is T {
      return nameToIndex.has(type as T);
    },
  };
}
