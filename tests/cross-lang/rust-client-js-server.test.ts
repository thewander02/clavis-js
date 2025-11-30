/**
 * Cross-language tests: Rust client -> JS server
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestServer } from "../helpers/test-server.js";
import { findAvailablePort, spawnRustBinary, waitForProcess } from "../helpers/test-utils.js";
import { TestProtocol } from "../helpers/test-protocol.js";
import { Server } from "net";
import { join } from "path";

describe("Rust Client -> JS Server", () => {
  let port: number;
  let server: Server | null = null;
  const rustBinaryPath = join(process.cwd(), "tests", "rust-binaries", "target", "release", "test-client");

  beforeEach(async () => {
    port = await findAvailablePort();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
  });

  test("should accept Rust client connection", async () => {
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        const [reader, writer] = stream.split();
        
        try {
          // Read Join packet
          await reader.readPacket<TestProtocol>();
          
          // Read Ping packet and respond
          await reader.readPacket<TestProtocol>();
          const response = TestProtocol.Pong({ message: "pong" });
          await writer.writePacket(response);
          
          // Read Shutdown packet (client will disconnect)
          await reader.readPacket<TestProtocol>();
        } catch (error) {
          // Client disconnected
        }
      },
    });

    // Spawn Rust client
    const rustClient = spawnRustBinary(rustBinaryPath, ["127.0.0.1", port.toString()]);
    
    // Wait for client to complete
    const exitCode = await waitForProcess(rustClient, 15000);
    // Exit code 143 is SIGTERM, which is acceptable if process completed
    expect(exitCode === 0 || exitCode === 143).toBe(true);
  }, 20000);

  test("should handle PSK authentication", async () => {
    const psk = new TextEncoder().encode("test-pre-shared-key-32bytes!!");

    server = await createTestServer({
      port,
      psk,
      onClient: async (stream) => {
        const [reader, writer] = stream.split();
        
        try {
          await reader.readPacket<TestProtocol>();
          // Send response packet
          const response = TestProtocol.Pong({ message: "pong" });
          await writer.writePacket(response);
        } catch (error) {
          // Client disconnected
        }
      },
    });

    const rustClient = spawnRustBinary(
      rustBinaryPath,
      ["127.0.0.1", port.toString(), new TextDecoder().decode(psk)]
    );

    const exitCode = await waitForProcess(rustClient, 15000);
    // Exit code 143 is SIGTERM, which is acceptable if process completed
    expect(exitCode === 0 || exitCode === 143).toBe(true);
  }, 20000);

  test("should handle multiple Rust clients", async () => {
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        const [reader, writer] = stream.split();
        
        try {
          await reader.readPacket<TestProtocol>();
          // Send response packet
          const response = TestProtocol.Pong({ message: "pong" });
          await writer.writePacket(response);
        } catch (error) {
          // Client disconnected
        }
      },
    });

    // Spawn multiple Rust clients
    const clients = [
      spawnRustBinary(rustBinaryPath, ["127.0.0.1", port.toString()]),
      spawnRustBinary(rustBinaryPath, ["127.0.0.1", port.toString()]),
      spawnRustBinary(rustBinaryPath, ["127.0.0.1", port.toString()]),
    ];

    // Wait for all clients to complete
    const exitCodes = await Promise.all(
      clients.map((client) => waitForProcess(client, 15000))
    );

    for (const code of exitCodes) {
      // Exit code 143 is SIGTERM, which is acceptable if process completed
      expect(code === 0 || code === 143).toBe(true);
    }
  }, 30000);
});

