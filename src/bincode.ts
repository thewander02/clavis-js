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

// ============================================================================
// WRITE FUNCTIONS (Serialization)
// ============================================================================

/**
 * Write a u8 (single byte)
 */
export function writeU8(buffer: number[], n: number): void {
  buffer.push(n & 0xff);
}

/**
 * Write a u16 in little-endian format
 */
export function writeU16(buffer: number[], n: number): void {
  buffer.push(n & 0xff);
  buffer.push((n >> 8) & 0xff);
}

/**
 * Write a u32 in little-endian format (fixed size)
 */
export function writeU32(buffer: number[], n: number): void {
  buffer.push(n & 0xff);
  buffer.push((n >> 8) & 0xff);
  buffer.push((n >> 16) & 0xff);
  buffer.push((n >> 24) & 0xff);
}

/**
 * Write an i32 in little-endian format (two's complement)
 */
export function writeI32(buffer: number[], n: number): void {
  // Convert to two's complement if negative
  const value = n < 0 ? (0x100000000 + n) : n;
  writeU32(buffer, value);
}

/**
 * Write a u64 in little-endian format
 */
export function writeU64(buffer: number[], n: bigint): void {
  const low = Number(n & 0xffffffffn);
  const high = Number((n >> 32n) & 0xffffffffn);
  writeU32(buffer, low);
  writeU32(buffer, high);
}

/**
 * Write an i64 in little-endian format (two's complement)
 */
export function writeI64(buffer: number[], n: bigint): void {
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
 * Write a DateTime as ISO 8601 string (chrono's string serialization format)
 * Use this when chrono is configured to serialize as string instead of struct
 */
export function writeChronoString(buffer: number[], date: Date): void {
  // Format: "2025-12-02T06:07:43Z" (without milliseconds to match chrono)
  const isoString = date.toISOString().replace('.000Z', 'Z');
  writeString(buffer, isoString);
}

/**
 * Write a bool as u8 (0 = false, 1 = true)
 */
export function writeBool(buffer: number[], value: boolean): void {
  buffer.push(value ? 1 : 0);
}

/**
 * Write a Vec<String>
 */
export function writeStringVec(buffer: number[], strings: string[]): void {
  writeU64(buffer, BigInt(strings.length));
  for (const s of strings) {
    writeString(buffer, s);
  }
}

// ============================================================================
// READ FUNCTIONS (Deserialization)
// ============================================================================

/** Result type for read operations */
export interface ReadResult<T> {
  value: T;
  bytesRead: number;
}

/**
 * Read a u8 (single byte)
 */
export function readU8(data: Uint8Array, offset: number): ReadResult<number> {
  if (offset >= data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading u8");
  }
  return { value: data[offset]!, bytesRead: 1 };
}

/**
 * Read a u16 in little-endian format
 */
export function readU16(data: Uint8Array, offset: number): ReadResult<number> {
  if (offset + 2 > data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading u16");
  }
  const value = data[offset]! | (data[offset + 1]! << 8);
  return { value, bytesRead: 2 };
}

/**
 * Read a u32 in little-endian format
 */
export function readU32(data: Uint8Array, offset: number): ReadResult<number> {
  if (offset + 4 > data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading u32");
  }
  const value = (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0; // Convert to unsigned
  return { value, bytesRead: 4 };
}

/**
 * Read an i32 in little-endian format (two's complement)
 */
export function readI32(data: Uint8Array, offset: number): ReadResult<number> {
  if (offset + 4 > data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading i32");
  }
  const value = (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  );
  return { value, bytesRead: 4 };
}

/**
 * Read a u64 in little-endian format
 */
export function readU64(data: Uint8Array, offset: number): ReadResult<bigint> {
  if (offset + 8 > data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading u64");
  }
  const low = BigInt(
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) & 0xffffffffn;
  const high = BigInt(
    data[offset + 4]! |
    (data[offset + 5]! << 8) |
    (data[offset + 6]! << 16) |
    (data[offset + 7]! << 24)
  ) & 0xffffffffn;
  return { value: (high << 32n) | low, bytesRead: 8 };
}

/**
 * Read an i64 in little-endian format (two's complement)
 */
export function readI64(data: Uint8Array, offset: number): ReadResult<bigint> {
  if (offset + 8 > data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading i64");
  }
  const { value: unsigned } = readU64(data, offset);
  // Convert from unsigned to signed if the high bit is set
  if (unsigned >= 0x8000000000000000n) {
    return { value: unsigned - 0x10000000000000000n, bytesRead: 8 };
  }
  return { value: unsigned, bytesRead: 8 };
}

/**
 * Read a Varint-encoded u32 (bincode's default encoding for enum variant indices)
 */
export function readVarintU32(data: Uint8Array, offset: number): ReadResult<number> {
  if (offset >= data.length) {
    throw ClavisError.deserializationFailed("Unexpected end of data reading varint");
  }
  const first = data[offset]!;
  if (first < 251) {
    return { value: first, bytesRead: 1 };
  }
  // 0xFB marker means 4-byte u32 follows
  if (first === 0xFB) {
    const result = readU32(data, offset + 1);
    return { value: result.value, bytesRead: 1 + result.bytesRead };
  }
  throw ClavisError.deserializationFailed(`Invalid varint marker: ${first}`);
}

/**
 * Read a string (u64 length + UTF-8 bytes)
 */
export function readString(data: Uint8Array, offset: number): ReadResult<string> {
  const lenResult = readU64(data, offset);
  const length = Number(lenResult.value);
  const start = offset + lenResult.bytesRead;
  
  if (start + length > data.length) {
    throw ClavisError.deserializationFailed(`String length ${length} exceeds available data`);
  }
  
  const bytes = data.slice(start, start + length);
  const value = new TextDecoder().decode(bytes);
  return { value, bytesRead: lenResult.bytesRead + length };
}

/**
 * Read an optional string (u8 discriminant + string if present)
 */
export function readOptionString(data: Uint8Array, offset: number): ReadResult<string | undefined> {
  const discriminant = readU8(data, offset);
  if (discriminant.value === 0) {
    return { value: undefined, bytesRead: 1 };
  }
  const stringResult = readString(data, offset + 1);
  return { value: stringResult.value, bytesRead: 1 + stringResult.bytesRead };
}

/**
 * Read an Option<u32> (u8 discriminant + value if Some)
 */
export function readOptionU32(data: Uint8Array, offset: number): ReadResult<number | undefined> {
  const discriminant = readU8(data, offset);
  if (discriminant.value === 0) {
    return { value: undefined, bytesRead: 1 };
  }
  const valueResult = readU32(data, offset + 1);
  return { value: valueResult.value, bytesRead: 1 + valueResult.bytesRead };
}

/**
 * Read a bool (u8: 0 = false, 1 = true)
 */
export function readBool(data: Uint8Array, offset: number): ReadResult<boolean> {
  const result = readU8(data, offset);
  return { value: result.value !== 0, bytesRead: 1 };
}

/**
 * Read a Vec<String>
 */
export function readStringVec(data: Uint8Array, offset: number): ReadResult<string[]> {
  const lenResult = readU64(data, offset);
  const length = Number(lenResult.value);
  const strings: string[] = [];
  let bytesRead = lenResult.bytesRead;
  
  for (let i = 0; i < length; i++) {
    const stringResult = readString(data, offset + bytesRead);
    strings.push(stringResult.value);
    bytesRead += stringResult.bytesRead;
  }
  
  return { value: strings, bytesRead };
}

/**
 * Read a Vec<(String, String)> (vector of string tuples)
 */
export function readStringPairVec(data: Uint8Array, offset: number): ReadResult<Array<[string, string]>> {
  const lenResult = readU64(data, offset);
  const length = Number(lenResult.value);
  const pairs: Array<[string, string]> = [];
  let bytesRead = lenResult.bytesRead;
  
  for (let i = 0; i < length; i++) {
    const keyResult = readString(data, offset + bytesRead);
    bytesRead += keyResult.bytesRead;
    const valueResult = readString(data, offset + bytesRead);
    bytesRead += valueResult.bytesRead;
    pairs.push([keyResult.value, valueResult.value]);
  }
  
  return { value: pairs, bytesRead };
}

/**
 * Read a DateTime<Utc> as struct { secs: i64, nsecs: u32 }
 * This matches chrono's default serde serialization with bincode
 */
export function readDateTime(data: Uint8Array, offset: number): ReadResult<Date> {
  const secsResult = readI64(data, offset);
  const nsecsResult = readU32(data, offset + secsResult.bytesRead);
  
  const ms = Number(secsResult.value) * 1000 + Math.floor(nsecsResult.value / 1_000_000);
  return { value: new Date(ms), bytesRead: secsResult.bytesRead + nsecsResult.bytesRead };
}

/**
 * Read a DateTime as ISO 8601 string (chrono's string serialization format)
 */
export function readChronoString(data: Uint8Array, offset: number): ReadResult<Date> {
  const stringResult = readString(data, offset);
  const date = new Date(stringResult.value);
  if (isNaN(date.getTime())) {
    throw ClavisError.deserializationFailed(`Invalid ISO 8601 date string: ${stringResult.value}`);
  }
  return { value: date, bytesRead: stringResult.bytesRead };
}

/**
 * Read raw bytes (for binary data like Uint8Array)
 */
export function readBytes(data: Uint8Array, offset: number): ReadResult<Uint8Array> {
  const lenResult = readU64(data, offset);
  const length = Number(lenResult.value);
  const start = offset + lenResult.bytesRead;
  
  if (start + length > data.length) {
    throw ClavisError.deserializationFailed(`Bytes length ${length} exceeds available data`);
  }
  
  const bytes = data.slice(start, start + length);
  return { value: bytes, bytesRead: lenResult.bytesRead + length };
}

// ============================================================================
// GENERIC SERIALIZATION
// ============================================================================

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

// ============================================================================
// BINCODE READER CLASS (Stateful Deserialization)
// ============================================================================

/**
 * BincodeReader provides a stateful wrapper for deserializing bincode data.
 * It automatically tracks the current position in the buffer.
 * 
 * @example
 * ```typescript
 * const reader = new BincodeReader(data);
 * const variantIndex = reader.readU32();
 * const correlationId = reader.readString();
 * const timestamp = reader.readString();
 * const sessionId = reader.readString();
 * ```
 */
export class BincodeReader {
  private data: Uint8Array;
  private pos: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /** Current read position */
  get offset(): number {
    return this.pos;
  }

  /** Remaining bytes to read */
  get remaining(): number {
    return this.data.length - this.pos;
  }

  /** Total length of the data */
  get length(): number {
    return this.data.length;
  }

  /** Check if there's more data to read */
  get hasMore(): boolean {
    return this.pos < this.data.length;
  }

  /** Reset position to the beginning */
  reset(): void {
    this.pos = 0;
  }

  /** Skip forward by n bytes */
  skip(n: number): void {
    if (this.pos + n > this.data.length) {
      throw ClavisError.deserializationFailed(`Cannot skip ${n} bytes, only ${this.remaining} remaining`);
    }
    this.pos += n;
  }

  /** Read a u8 */
  readU8(): number {
    const result = readU8(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a u16 */
  readU16(): number {
    const result = readU16(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a u32 */
  readU32(): number {
    const result = readU32(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read an i32 */
  readI32(): number {
    const result = readI32(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a u64 */
  readU64(): bigint {
    const result = readU64(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read an i64 */
  readI64(): bigint {
    const result = readI64(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a Varint-encoded u32 */
  readVarintU32(): number {
    const result = readVarintU32(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a string */
  readString(): string {
    const result = readString(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read an optional string */
  readOptionString(): string | undefined {
    const result = readOptionString(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read an Option<u32> */
  readOptionU32(): number | undefined {
    const result = readOptionU32(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a bool */
  readBool(): boolean {
    const result = readBool(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a Vec<String> */
  readStringVec(): string[] {
    const result = readStringVec(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a Vec<(String, String)> */
  readStringPairVec(): Array<[string, string]> {
    const result = readStringPairVec(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a DateTime (struct format) */
  readDateTime(): Date {
    const result = readDateTime(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a DateTime (ISO 8601 string format) */
  readChronoString(): Date {
    const result = readChronoString(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read raw bytes */
  readBytes(): Uint8Array {
    const result = readBytes(this.data, this.pos);
    this.pos += result.bytesRead;
    return result.value;
  }

  /** Read a fixed number of raw bytes without length prefix */
  readRawBytes(length: number): Uint8Array {
    if (this.pos + length > this.data.length) {
      throw ClavisError.deserializationFailed(`Cannot read ${length} bytes, only ${this.remaining} remaining`);
    }
    const bytes = this.data.slice(this.pos, this.pos + length);
    this.pos += length;
    return bytes;
  }

  /** Peek at the next byte without consuming it */
  peekU8(): number {
    if (this.pos >= this.data.length) {
      throw ClavisError.deserializationFailed("Unexpected end of data peeking u8");
    }
    return this.data[this.pos]!;
  }

  /** Peek at the next u32 without consuming it */
  peekU32(): number {
    const result = readU32(this.data, this.pos);
    return result.value;
  }

  /** Create a sub-reader for a portion of the data */
  slice(length: number): BincodeReader {
    if (this.pos + length > this.data.length) {
      throw ClavisError.deserializationFailed(`Cannot slice ${length} bytes, only ${this.remaining} remaining`);
    }
    const subData = this.data.slice(this.pos, this.pos + length);
    this.pos += length;
    return new BincodeReader(subData);
  }
}
