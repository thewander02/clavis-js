/**
 * Bidirectional cross-language tests
 * Tests both directions in the same test suite
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestServer } from "../helpers/test-server.js";
import { createTestClient } from "../helpers/test-client.js";
import { findAvailablePort, spawnRustBinary, waitForServer, waitForProcess } from "../helpers/test-utils.js";
import { TestProtocol } from "../helpers/test-protocol.js";
import { Server } from "net";
import { join } from "path";

describe("Bidirectional Cross-Language Tests", () => {
  let port1: number;
  let port2: number;
  let jsServer: Server | null = null;
  let rustServer: ReturnType<typeof spawnRustBinary> | null = null;
  const rustServerPath = join(process.cwd(), "tests", "rust-binaries", "target", "release", "test-server");
  const rustClientPath = join(process.cwd(), "tests", "rust-binaries", "target", "release", "test-client");

  beforeEach(async () => {
    port1 = await findAvailablePort(9000);
    port2 = await findAvailablePort(port1 + 1);
  });

  afterEach(async () => {
    if (jsServer) {
      await new Promise<void>((resolve) => {
        jsServer!.close(() => resolve());
      });
      jsServer = null;
    }
    if (rustServer) {
      rustServer.kill();
      rustServer = null;
    }
  });

  test("should verify protocol compatibility", async () => {
    // Start JS server
    jsServer = await createTestServer({
      port: port1,
      onClient: async (stream) => {
        const [reader, writer] = stream.split();
        
        try {
          // Read packets (can't deserialize yet)
          await reader.readPacket<TestProtocol>(); // Join
          
          // Send Status response
          const status = TestProtocol.Status({
            users_online: 1,
            server_uptime: 1000,
          });
          await writer.writePacket(status);
          
          await reader.readPacket<TestProtocol>(); // Message
        } catch (error) {
          // Client disconnected
        }
      },
    });

    // Start Rust server
    rustServer = spawnRustBinary(rustServerPath, [port2.toString()]);
    await waitForServer("127.0.0.1", port2, 5000);

    // JS client -> Rust server
    const jsClient1 = await createTestClient({
      host: "127.0.0.1",
      port: port2,
    });
    const [reader1, writer1] = jsClient1.stream.split();

    const ping = TestProtocol.Ping({ message: "js-to-rust" });
    await writer1.writePacket(ping);

    const response1 = await reader1.readPacket<TestProtocol>();
    expect(response1).toBeDefined();
    expect(response1 instanceof Uint8Array).toBe(true);

    await writer1.writePacket(TestProtocol.Shutdown());
    jsClient1.close();

    // Rust client -> JS server
    const rustClient = spawnRustBinary(rustClientPath, ["127.0.0.1", port1.toString()]);
    const exitCode = await waitForProcess(rustClient, 15000);
    // Exit code 143 is SIGTERM, which is acceptable
    expect(exitCode === 0 || exitCode === 143).toBe(true);
  }, 30000);

  test("should handle PSK in both directions", async () => {
    const psk = new TextEncoder().encode("test-pre-shared-key-32bytes!!");

    // JS server with PSK
    jsServer = await createTestServer({
      port: port1,
      psk,
      onClient: async (stream) => {
        const [reader, writer] = stream.split();
        try {
          // Read packet and send echo response
          await reader.readPacket<TestProtocol>();
          const echo = TestProtocol.Pong({ message: "echo" });
          await writer.writePacket(echo);
        } catch (error) {
          // Client disconnected
        }
      },
    });

    // Rust server with PSK
    rustServer = spawnRustBinary(rustServerPath, [
      port2.toString(),
      new TextDecoder().decode(psk),
    ]);
    await waitForServer("127.0.0.1", port2, 5000);
    
    // Small delay to ensure server is fully ready
    await new Promise(resolve => setTimeout(resolve, 200));

    // JS client -> Rust server (with PSK)
    const jsClient = await createTestClient({
      host: "127.0.0.1",
      port: port2,
      psk,
    });
    const [reader, writer] = jsClient.stream.split();

    await writer.writePacket(TestProtocol.Ping({ message: "test" }));
    const response = await reader.readPacket<TestProtocol>();
    expect(response).toBeDefined();

    await writer.writePacket(TestProtocol.Shutdown());
    
    // Wait for shutdown to be processed
    await new Promise(resolve => setTimeout(resolve, 200));
    jsClient.close();

    // Rust client -> JS server (with PSK)
    const rustClient = spawnRustBinary(rustClientPath, [
      "127.0.0.1",
      port1.toString(),
      new TextDecoder().decode(psk),
    ]);
    const exitCode = await waitForProcess(rustClient, 15000);
    // Exit code 143 is SIGTERM, which is acceptable
    expect(exitCode === 0 || exitCode === 143).toBe(true);
  }, 30000);
});

