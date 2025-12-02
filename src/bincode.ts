/**
 * Bincode-compatible serialization for TypeScript
 * This implementation matches Rust's bincode format with serde
 * 
 * Bincode format (matching bincode 1.3 with default VarintEncoding):
 * - Integers: little-endian, VarintEncoding for small values
 * - Strings/Vec: length (u64) + data
 * - Enums: variant index (Varint-encoded u32) + variant data
 * - Structs: fields serialized in definition order
 * - Options: u8 discriminant (0=None, 1=Some) + value if Some
 * - DateTime<Utc>: struct { secs: i64, nsecs: u32 }
 */

import { ClavisError } from "./error.js";

/**
 * Write a u8 (single byte)
 */
function writeU8(buffer: number[], n: number): void {
  buffer.push(n & 0xff);
}

/**
 * Write a u16 in little-endian format
 */
function writeU16(buffer: number[], n: number): void {
  buffer.push(n & 0xff);
  buffer.push((n >> 8) & 0xff);
}

/**
 * Write a u32 in little-endian format (fixed size)
 */
function writeU32(buffer: number[], n: number): void {
  buffer.push(n & 0xff);
  buffer.push((n >> 8) & 0xff);
  buffer.push((n >> 16) & 0xff);
  buffer.push((n >> 24) & 0xff);
}

/**
 * Write an i32 in little-endian format (two's complement)
 */
function writeI32(buffer: number[], n: number): void {
  // Convert to two's complement if negative
  const value = n < 0 ? (0x100000000 + n) : n;
  writeU32(buffer, value);
}

/**
 * Write a u64 in little-endian format
 */
function writeU64(buffer: number[], n: bigint): void {
  const low = Number(n & 0xffffffffn);
  const high = Number((n >> 32n) & 0xffffffffn);
  writeU32(buffer, low);
  writeU32(buffer, high);
}

/**
 * Write an i64 in little-endian format (two's complement)
 */
function writeI64(buffer: number[], n: bigint): void {
  // Convert to two's complement if negative
  const value = n < 0n ? (0x10000000000000000n + n) : n;
  const low = Number(value & 0xffffffffn);
  const high = Number((value >> 32n) & 0xffffffffn);
  writeU32(buffer, low);
  writeU32(buffer, high);
}

/**
 * Write a Varint-encoded u32 (bincode's default encoding for enum variant indices)
 * For values < 251: single byte
 * For values >= 251: 0xFB + 4 bytes (little-endian u32)
 * This matches bincode 1.3's VarintEncoding default
 */
export function writeVarintU32(buffer: number[], n: number): void {
  if (n < 251) {
    buffer.push(n);
  } else {
    buffer.push(0xFB); // Marker for 4-byte encoding
    writeU32(buffer, n);
  }
}

/**
 * Write a string (u64 length + UTF-8 bytes)
 */
export function writeString(buffer: number[], s: string): void {
  const bytes = new TextEncoder().encode(s);
  writeU64(buffer, BigInt(bytes.length));
  buffer.push(...bytes);
}

/**
 * Write an optional string (u8 0/1 + string if present)
 */
export function writeOptionString(buffer: number[], s: string | undefined | null): void {
  if (s === undefined || s === null) {
    buffer.push(0); // None
  } else {
    buffer.push(1); // Some
    writeString(buffer, s);
  }
}

/**
 * Write a Vec<(String, String)> (vector of tuples)
 */
export function writeStringPairVec(buffer: number[], pairs: Array<[string, string]>): void {
  writeU64(buffer, BigInt(pairs.length));
  for (const [key, value] of pairs) {
    writeString(buffer, key);
    writeString(buffer, value);
  }
}

/**
 * Write an Option<u32> (u8 discriminant + value if Some)
 */
export function writeOptionU32(buffer: number[], n: number | undefined | null): void {
  if (n === undefined || n === null) {
    buffer.push(0); // None
  } else {
    buffer.push(1); // Some
    writeU32(buffer, n);
  }
}

/**
 * Write a DateTime<Utc> as struct { secs: i64, nsecs: u32 }
 * This matches chrono's default serde serialization with bincode
 */
export function writeDateTime(buffer: number[], date: Date): void {
  const msSinceEpoch = date.getTime();
  const secs = BigInt(Math.floor(msSinceEpoch / 1000));
  const nsecs = (msSinceEpoch % 1000) * 1_000_000; // Convert ms remainder to nanoseconds (0-999,999,999)
  
  writeI64(buffer, secs);
  writeU32(buffer, nsecs);
}

/**
 * Serialize a value to bincode format (matching Rust bincode with serde)
 * This is a generic serializer that handles common types
 */
export function serialize(value: any): Uint8Array {
  const buffer: number[] = [];
  
  function serializeValue(val: unknown): void {
    if (val === null || val === undefined) {
      throw ClavisError.serializationFailed("Cannot serialize null/undefined");
    }

    if (typeof val === "boolean") {
      writeU8(buffer, val ? 1 : 0);
      return;
    }

    if (typeof val === "number") {
      // For now, assume u32 (can be extended based on value range)
      if (Number.isInteger(val)) {
        if (val >= 0 && val <= 0xffffffff) {
          writeU32(buffer, val);
        } else {
          throw ClavisError.serializationFailed(`Number out of u32 range: ${val}`);
        }
      } else {
        throw ClavisError.serializationFailed(`Unsupported number type: ${val}`);
      }
      return;
    }

    if (typeof val === "bigint") {
      writeU64(buffer, val);
      return;
    }

    if (typeof val === "string") {
      writeString(buffer, val);
      return;
    }

    if (val instanceof Date) {
      writeDateTime(buffer, val);
      return;
    }

    if (val instanceof Uint8Array) {
      writeU64(buffer, BigInt(val.length));
      buffer.push(...val);
      return;
    }

    if (Array.isArray(val)) {
      writeU64(buffer, BigInt(val.length));
      for (const item of val) {
        serializeValue(item);
      }
      return;
    }

    if (typeof val === "object") {
      const obj = val as Record<string, unknown>;
      // Check if it has a __bincodeType marker
      if (obj.__bincodeType === "enum") {
        // Enum: variant index (Varint-encoded u32) + variant data
        writeVarintU32(buffer, obj.__variantIndex as number);
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
