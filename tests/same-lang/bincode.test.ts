/**
 * Bincode serialization/deserialization tests
 */

import { describe, test, expect } from "bun:test";
import {
  writeU8,
  writeU16,
  writeU32,
  writeU64,
  writeI64,
  writeString,
  writeOptionString,
  writeStringPairVec,
  writeDateTime,
  writeChronoString,
  writeBool,
  writeStringVec,
  readU8,
  readU16,
  readU32,
  readU64,
  readI64,
  readString,
  readOptionString,
  readBool,
  readStringVec,
  readStringPairVec,
  readDateTime,
  readChronoString,
  BincodeReader,
} from "../../src/bincode.js";

describe("Bincode Write Functions", () => {
  test("writeU8 should write a single byte", () => {
    const buffer: number[] = [];
    writeU8(buffer, 0xff);
    expect(buffer).toEqual([0xff]);
  });

  test("writeU16 should write 2 bytes little-endian", () => {
    const buffer: number[] = [];
    writeU16(buffer, 0x1234);
    expect(buffer).toEqual([0x34, 0x12]);
  });

  test("writeU32 should write 4 bytes little-endian", () => {
    const buffer: number[] = [];
    writeU32(buffer, 0x12345678);
    expect(buffer).toEqual([0x78, 0x56, 0x34, 0x12]);
  });

  test("writeU64 should write 8 bytes little-endian", () => {
    const buffer: number[] = [];
    writeU64(buffer, 0x123456789abcdef0n);
    expect(buffer).toEqual([0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12]);
  });

  test("writeString should write length + UTF-8 bytes", () => {
    const buffer: number[] = [];
    writeString(buffer, "hello");
    // u64 length (5) + "hello"
    expect(buffer.slice(0, 8)).toEqual([5, 0, 0, 0, 0, 0, 0, 0]);
    expect(buffer.slice(8)).toEqual([104, 101, 108, 108, 111]); // "hello"
  });

  test("writeOptionString should handle Some and None", () => {
    const bufferSome: number[] = [];
    writeOptionString(bufferSome, "test");
    expect(bufferSome[0]).toBe(1); // Some discriminant

    const bufferNone: number[] = [];
    writeOptionString(bufferNone, undefined);
    expect(bufferNone).toEqual([0]); // None discriminant
  });

  test("writeBool should write 0 or 1", () => {
    const bufferTrue: number[] = [];
    writeBool(bufferTrue, true);
    expect(bufferTrue).toEqual([1]);

    const bufferFalse: number[] = [];
    writeBool(bufferFalse, false);
    expect(bufferFalse).toEqual([0]);
  });
});

describe("Bincode Read Functions", () => {
  test("readU8 should read a single byte", () => {
    const data = new Uint8Array([0xff]);
    const result = readU8(data, 0);
    expect(result.value).toBe(0xff);
    expect(result.bytesRead).toBe(1);
  });

  test("readU16 should read 2 bytes little-endian", () => {
    const data = new Uint8Array([0x34, 0x12]);
    const result = readU16(data, 0);
    expect(result.value).toBe(0x1234);
    expect(result.bytesRead).toBe(2);
  });

  test("readU32 should read 4 bytes little-endian", () => {
    const data = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
    const result = readU32(data, 0);
    expect(result.value).toBe(0x12345678);
    expect(result.bytesRead).toBe(4);
  });

  test("readU64 should read 8 bytes little-endian", () => {
    const data = new Uint8Array([0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12]);
    const result = readU64(data, 0);
    expect(result.value).toBe(0x123456789abcdef0n);
    expect(result.bytesRead).toBe(8);
  });

  test("readString should read length + UTF-8 bytes", () => {
    const buffer: number[] = [];
    writeString(buffer, "hello world");
    const data = new Uint8Array(buffer);
    
    const result = readString(data, 0);
    expect(result.value).toBe("hello world");
    expect(result.bytesRead).toBe(8 + 11); // u64 length + string bytes
  });

  test("readOptionString should handle Some and None", () => {
    // Test Some
    const bufferSome: number[] = [];
    writeOptionString(bufferSome, "test");
    const dataSome = new Uint8Array(bufferSome);
    const resultSome = readOptionString(dataSome, 0);
    expect(resultSome.value).toBe("test");

    // Test None
    const bufferNone: number[] = [];
    writeOptionString(bufferNone, undefined);
    const dataNone = new Uint8Array(bufferNone);
    const resultNone = readOptionString(dataNone, 0);
    expect(resultNone.value).toBeUndefined();
    expect(resultNone.bytesRead).toBe(1);
  });

  test("readBool should read boolean values", () => {
    const dataTrue = new Uint8Array([1]);
    const resultTrue = readBool(dataTrue, 0);
    expect(resultTrue.value).toBe(true);

    const dataFalse = new Uint8Array([0]);
    const resultFalse = readBool(dataFalse, 0);
    expect(resultFalse.value).toBe(false);
  });

  test("readStringVec should read array of strings", () => {
    const buffer: number[] = [];
    writeStringVec(buffer, ["one", "two", "three"]);
    const data = new Uint8Array(buffer);
    
    const result = readStringVec(data, 0);
    expect(result.value).toEqual(["one", "two", "three"]);
  });

  test("readStringPairVec should read array of string tuples", () => {
    const buffer: number[] = [];
    writeStringPairVec(buffer, [["key1", "value1"], ["key2", "value2"]]);
    const data = new Uint8Array(buffer);
    
    const result = readStringPairVec(data, 0);
    expect(result.value).toEqual([["key1", "value1"], ["key2", "value2"]]);
  });

  test("readDateTime should read struct format datetime", () => {
    const now = new Date();
    const buffer: number[] = [];
    writeDateTime(buffer, now);
    const data = new Uint8Array(buffer);
    
    const result = readDateTime(data, 0);
    // Allow 1 second tolerance due to millisecond truncation
    expect(Math.abs(result.value.getTime() - now.getTime())).toBeLessThan(1000);
  });

  test("readChronoString should read ISO 8601 format datetime", () => {
    const now = new Date();
    const buffer: number[] = [];
    writeChronoString(buffer, now);
    const data = new Uint8Array(buffer);
    
    const result = readChronoString(data, 0);
    // ISO string format truncates milliseconds in our implementation
    expect(Math.abs(result.value.getTime() - now.getTime())).toBeLessThan(1000);
  });
});

describe("BincodeReader", () => {
  test("should track position automatically", () => {
    const buffer: number[] = [];
    writeU32(buffer, 42);
    writeString(buffer, "test");
    const data = new Uint8Array(buffer);
    
    const reader = new BincodeReader(data);
    expect(reader.offset).toBe(0);
    expect(reader.remaining).toBe(data.length);
    
    const num = reader.readU32();
    expect(num).toBe(42);
    expect(reader.offset).toBe(4);
    
    const str = reader.readString();
    expect(str).toBe("test");
    expect(reader.hasMore).toBe(false);
  });

  test("should support peek operations", () => {
    const buffer: number[] = [];
    writeU8(buffer, 0xAB);
    const data = new Uint8Array(buffer);
    
    const reader = new BincodeReader(data);
    expect(reader.peekU8()).toBe(0xAB);
    expect(reader.offset).toBe(0); // Position unchanged
    expect(reader.readU8()).toBe(0xAB);
    expect(reader.offset).toBe(1); // Position advanced
  });

  test("should support skip operation", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const reader = new BincodeReader(data);
    
    reader.skip(3);
    expect(reader.offset).toBe(3);
    expect(reader.readU8()).toBe(4);
  });

  test("should support reset operation", () => {
    const data = new Uint8Array([1, 2, 3]);
    const reader = new BincodeReader(data);
    
    reader.readU8();
    reader.readU8();
    expect(reader.offset).toBe(2);
    
    reader.reset();
    expect(reader.offset).toBe(0);
  });

  test("should support reading raw bytes", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const reader = new BincodeReader(data);
    
    const bytes = reader.readRawBytes(3);
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(reader.offset).toBe(3);
  });

  test("should handle complex nested data", () => {
    const buffer: number[] = [];
    writeU32(buffer, 1); // variant index
    writeString(buffer, "correlation-123");
    writeString(buffer, "2025-01-01T00:00:00Z");
    writeString(buffer, "session-456");
    writeU32(buffer, 30); // heartbeat interval
    writeU32(buffer, 10); // max concurrency
    const data = new Uint8Array(buffer);
    
    const reader = new BincodeReader(data);
    expect(reader.readU32()).toBe(1);
    expect(reader.readString()).toBe("correlation-123");
    expect(reader.readString()).toBe("2025-01-01T00:00:00Z");
    expect(reader.readString()).toBe("session-456");
    expect(reader.readU32()).toBe(30);
    expect(reader.readU32()).toBe(10);
    expect(reader.hasMore).toBe(false);
  });
});

describe("Round-trip serialization", () => {
  test("should round-trip signed integers", () => {
    const buffer: number[] = [];
    writeI64(buffer, -12345n);
    const data = new Uint8Array(buffer);
    const result = readI64(data, 0);
    expect(result.value).toBe(-12345n);
  });

  test("should round-trip large unsigned integers", () => {
    const buffer: number[] = [];
    writeU64(buffer, 0xffffffffffffffffn);
    const data = new Uint8Array(buffer);
    const result = readU64(data, 0);
    expect(result.value).toBe(0xffffffffffffffffn);
  });

  test("should round-trip Unicode strings", () => {
    const testStrings = [
      "Hello, World!",
      "こんにちは",
      "🎉🚀",
      "Mixed: Hello 世界 🌍",
    ];
    
    for (const str of testStrings) {
      const buffer: number[] = [];
      writeString(buffer, str);
      const data = new Uint8Array(buffer);
      const result = readString(data, 0);
      expect(result.value).toBe(str);
    }
  });
});

