/**
 * Bincode serialization helpers for common Rust types
 * These helpers make it easy to serialize data structures that match Rust's serde format
 */

import { writeVarintU32, writeString, writeOptionU32, writeDateTime, writeU8, writeU32, writeU64 } from "./bincode.js";

/**
 * Serialize a MessageHeader structure
 * Matches Rust: struct MessageHeader { correlation_id: String, timestamp: DateTime<Utc> }
 */
export function serializeMessageHeader(buffer: number[], header: { 
  correlation_id: string; 
  timestamp?: number | Date;
}): void {
  writeString(buffer, header.correlation_id);
  
  // DateTime<Utc> serializes as struct { secs: i64, nsecs: u32 }
  const timestamp = header.timestamp instanceof Date 
    ? header.timestamp 
    : (header.timestamp ? new Date(header.timestamp) : new Date());
  writeDateTime(buffer, timestamp);
}

/**
 * Serialize a ResourceSpec structure
 * Matches Rust: struct ResourceSpec { memory_mb: u32, cpu_units: u32, disk_gb: Option<u32> }
 */
export function serializeResourceSpec(buffer: number[], spec: { 
  memory_mb: number; 
  cpu_units?: number; 
  disk_gb?: number;
}): void {
  writeU32(buffer, spec.memory_mb);
  writeU32(buffer, spec.cpu_units ?? 1024);
  writeOptionU32(buffer, spec.disk_gb);
}

/**
 * Serialize an enum variant with Varint-encoded index
 * This is the correct format for bincode enum serialization
 */
export function serializeEnumVariant(buffer: number[], variantIndex: number, variantData?: any): void {
  // Write variant index using VarintEncoding (matches bincode default)
  writeVarintU32(buffer, variantIndex);
  
  // Variant data is serialized after the index
  if (variantData !== undefined) {
    serializeValue(buffer, variantData);
  }
}

/**
 * Helper to serialize a value (recursive)
 */
function serializeValue(buffer: number[], value: any): void {
  if (value === null || value === undefined) {
    throw new Error("Cannot serialize null/undefined");
  }

  if (typeof value === "boolean") {
    writeU8(buffer, value ? 1 : 0);
  } else if (typeof value === "number") {
    writeU32(buffer, value);
  } else if (typeof value === "bigint") {
    writeU64(buffer, value);
  } else if (typeof value === "string") {
    writeString(buffer, value);
  } else if (value instanceof Date) {
    writeDateTime(buffer, value);
  } else if (Array.isArray(value)) {
    writeU64(buffer, BigInt(value.length));
    for (const item of value) {
      serializeValue(buffer, item);
    }
  } else if (typeof value === "object") {
    // Object/struct: serialize fields in order
    const keys = Object.keys(value);
    for (const key of keys) {
      serializeValue(buffer, value[key]);
    }
  } else {
    throw new Error(`Unsupported type: ${typeof value}`);
  }
}

