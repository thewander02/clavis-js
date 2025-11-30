/**
 * Bincode-compatible serialization for TypeScript
 * This implementation matches Rust's bincode format with serde
 * 
 * Bincode format:
 * - Integers: little-endian, variable length encoding for some
 * - Strings/Vec: length (u64) + data
 * - Enums: variant index (u32) + variant data
 * - Structs: fields serialized in order
 */

import { ClavisError } from "./error.js";

/**
 * Serialize a value to bincode format (matching Rust bincode with serde)
 */
export function serialize(value: any): Uint8Array {
  const buffer: number[] = [];
  
  function writeU8(n: number) {
    buffer.push(n & 0xff);
  }
  
  function writeU32(n: number) {
    // Little-endian u32
    buffer.push(n & 0xff);
    buffer.push((n >> 8) & 0xff);
    buffer.push((n >> 16) & 0xff);
    buffer.push((n >> 24) & 0xff);
  }
  
  function writeU64(n: bigint) {
    // Little-endian u64
    const low = Number(n & 0xffffffffn);
    const high = Number((n >> 32n) & 0xffffffffn);
    writeU32(low);
    writeU32(high);
  }
  
  function serializeValue(val: unknown): void {
    if (val === null || val === undefined) {
      throw ClavisError.serializationFailed("Cannot serialize null/undefined");
    }

    if (typeof val === "boolean") {
      writeU8(val ? 1 : 0);
      return;
    }

    if (typeof val === "number") {
      // For now, assume u32 (can be extended based on value range)
      if (Number.isInteger(val)) {
        if (val >= 0 && val <= 0xffffffff) {
          writeU32(val);
        } else {
          throw ClavisError.serializationFailed(`Number out of u32 range: ${val}`);
        }
      } else {
        throw ClavisError.serializationFailed(`Unsupported number type: ${val}`);
      }
      return;
    }

    if (typeof val === "bigint") {
      writeU64(val);
      return;
    }

    if (typeof val === "string") {
      const bytes = new TextEncoder().encode(val);
      writeU64(BigInt(bytes.length));
      buffer.push(...bytes);
      return;
    }

    if (val instanceof Uint8Array) {
      writeU64(BigInt(val.length));
      buffer.push(...val);
      return;
    }

    if (Array.isArray(val)) {
      writeU64(BigInt(val.length));
      for (const item of val) {
        serializeValue(item);
      }
      return;
    }

    if (typeof val === "object") {
      const obj = val as Record<string, unknown>;
      // Check if it has a __bincodeType marker
      if (obj.__bincodeType === "enum") {
        // Enum: variant index (u32) + variant data
        writeU32(obj.__variantIndex as number);
        if (obj.__variantData !== undefined) {
          serializeValue(obj.__variantData);
        }
      } else {
        // Object/struct: serialize fields in order
        // For serde-compatible structs, fields are serialized in definition order
        const keys = Object.keys(obj).filter(k => !k.startsWith("__"));
        for (const key of keys) {
          serializeValue(obj[key]);
        }
      }
      return;
    }

    throw ClavisError.serializationFailed(`Unsupported type: ${typeof val}`);
  }
  
  serializeValue(value);
  return new Uint8Array(buffer);
}

/**
 * Deserialize a value from bincode format
 * Note: This requires type information to properly deserialize
 * For enums, we need the enum definition to know which variant to create
 */
/**
 * Deserialize a value from bincode format.
 * Note: Full deserialization requires protocol definition.
 * This function provides the basic deserialization infrastructure.
 */
export function deserialize<T>(data: Uint8Array): T {
  if (data.length === 0) {
    throw ClavisError.deserializationFailed("Empty packet data");
  }

  // This is a placeholder - actual deserialization will be handled by the protocol helper
  throw ClavisError.deserializationFailed("Deserialization requires protocol definition");
}

/**
 * Helper to check if we've consumed all data
 */
export function getRemainingBytes(data: Uint8Array, offset: number): number {
  return data.length - offset;
}
