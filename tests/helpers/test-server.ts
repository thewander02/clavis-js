/**
 * Test server helpers for creating JS test servers
 */

import { createServer, Server, Socket } from "net";
import { EncryptedStream, type EncryptedStreamOptions } from "../../src/stream.js";
import type { PacketTrait } from "../../src/protocol.js";

export interface TestServerOptions {
  port: number;
  host?: string;
  psk?: Uint8Array;
  maxPacketSize?: number;
  onClient?: (stream: EncryptedStream, socket: Socket) => Promise<void>;
}

/**
 * Create a test server that accepts encrypted connections
 */
export async function createTestServer(
  options: TestServerOptions
): Promise<Server> {
  const server = createServer(async (socket: Socket) => {
    try {
      const streamOptions: EncryptedStreamOptions = {};
      if (options.maxPacketSize !== undefined) {
        streamOptions.maxPacketSize = options.maxPacketSize;
      }
      if (options.psk !== undefined) {
        streamOptions.psk = options.psk;
      }

      const encryptedStream = await EncryptedStream.new(socket, streamOptions);
      
      if (options.onClient) {
        await options.onClient(encryptedStream, socket);
      }
    } catch (error) {
      console.error("Error handling client:", error);
      socket.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(options.port, options.host || "127.0.0.1", () => {
      resolve(server);
    });
    
    server.on("error", reject);
  });
}

/**
 * Create a simple echo server that echoes back packets
 * Note: Currently just accepts connections - full echo requires packet deserialization
 */
export async function createEchoServer(
  port: number,
  options?: { psk?: Uint8Array; maxPacketSize?: number }
): Promise<Server> {
  const serverOptions: TestServerOptions = {
    port,
    onClient: async (stream) => {
      // Just accept the connection - full echo requires deserialization
      // which isn't fully implemented yet
      const { reader } = stream.split();
      try {
        // Read packets but don't echo back (can't deserialize yet)
        while (true) {
          await reader.readPacket<PacketTrait>();
        }
      } catch {
        // Client disconnected or error occurred
      }
    },
  };
  if (options?.psk !== undefined) {
    serverOptions.psk = options.psk;
  }
  if (options?.maxPacketSize !== undefined) {
    serverOptions.maxPacketSize = options.maxPacketSize;
  }
  return createTestServer(serverOptions);
}

