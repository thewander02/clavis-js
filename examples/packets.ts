/**
 * Example protocol definition
 * Demonstrates how to define packet types for Clavis communication
 */

import { protocol } from "../src/protocol.js";

/**
 * Ping/Pong data structure
 */
export interface PingPongData {
  message: string;
}

/**
 * Define the protocol enum
 * Note: This uses the protocol DSL - for full bincode compatibility,
 * see tests/helpers/test-protocol.ts for a complete implementation
 */
export const Packet = protocol({
  Ping: ["PingPongData"],
  Pong: ["PingPongData"],
  Shutdown: [],
});
