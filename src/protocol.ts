/**
 * Protocol DSL for defining packet types
 * This provides a TypeScript equivalent to Rust's protocol! macro
 * 
 * Usage example:
 * ```typescript
 * const ChatProtocol = protocol({
 *   Heartbeat: [],
 *   Join: [String],
 *   Leave: [String],
 *   Message: [ChatMessage],
 *   Status: [{ users_online: Number, server_uptime: Number }],
 * });
 * ```
 */

import { ClavisError } from "./error.js";

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
 * This is a simplified version - full bincode compatibility will be added
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
  class ProtocolEnum {
    variantIndex: number;
    variantName: string;
    variantData?: unknown;

    constructor(variantIndex: number, variantName: string, variantData?: unknown) {
      this.variantIndex = variantIndex;
      this.variantName = variantName;
      this.variantData = variantData;
    }

    serialize(): Uint8Array {
      // This will be implemented with proper bincode serialization
      throw ClavisError.serializationFailed("Serialization not yet fully implemented");
    }

    static deserialize(_data: Uint8Array): ProtocolEnum {
      // This will be implemented with proper bincode deserialization
      throw ClavisError.deserializationFailed("Deserialization not yet fully implemented");
    }
  }

  // Add static factory methods for each variant
  for (const variant of variants) {
    (ProtocolEnum as unknown as Record<string, unknown>)[variant.name] = (...args: unknown[]) => {
      return new ProtocolEnum(variant.index, variant.name, args.length === 1 ? args[0] : args);
    };
  }

  return ProtocolEnum;
}
