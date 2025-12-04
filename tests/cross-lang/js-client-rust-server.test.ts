/**
 * Cross-language tests: JS client -> Rust server
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestClient } from "../helpers/test-client.js";
import { findAvailablePort, spawnRustBinary, waitForServer } from "../helpers/test-utils.js";
import { TestProtocol } from "../helpers/test-protocol.js";
import { join } from "path";

describe("JS Client -> Rust Server", () => {
  let port: number;
  let rustServer: ReturnType<typeof spawnRustBinary> | null = null;
  const rustBinaryPath = join(process.cwd(), "tests", "rust-binaries", "target", "release", "test-server");

  beforeEach(async () => {
    port = await findAvailablePort();
  });

  afterEach(async () => {
    if (rustServer) {
      rustServer.kill();
      rustServer = null;
    }
  });

  test("should connect JS client to Rust server", async () => {
    // Spawn Rust server
    rustServer = spawnRustBinary(rustBinaryPath, [port.toString()]);
    
    // Wait for server to be ready
    await waitForServer("127.0.0.1", port, 5000);

    // Connect JS client
    const client = await createTestClient({
      host: "127.0.0.1",
      port,
    });

    expect(client.stream).toBeDefined();

    const { reader, writer } = client.stream.split();

    // Send a packet
    const ping = TestProtocol.Ping({ message: "hello from js" });
    await writer.writePacket(ping);

    // Read response (Rust server echoes back)
    const response = await reader.readPacket<TestProtocol>();
    expect(response).toBeDefined();

    // Send shutdown
    await writer.writePacket(TestProtocol.Shutdown());

    // Wait a bit for server to process shutdown
    await new Promise(resolve => setTimeout(resolve, 200));
    client.close();
  }, 20000);

  test("should handle PSK authentication", async () => {
    const psk = new TextEncoder().encode("test-pre-shared-key-32bytes!!");

    // Spawn Rust server with PSK
    rustServer = spawnRustBinary(rustBinaryPath, [port.toString(), new TextDecoder().decode(psk)]);
    
    await waitForServer("127.0.0.1", port, 5000);

    const client = await createTestClient({
      host: "127.0.0.1",
      port,
      psk,
    });

    const { reader, writer } = client.stream.split();

    const ping = TestProtocol.Ping({ message: "test" });
    await writer.writePacket(ping);

    const response = await reader.readPacket<TestProtocol>();
    expect(response).toBeDefined();

    await writer.writePacket(TestProtocol.Shutdown());
    
    // Wait for shutdown to be processed
    await new Promise(resolve => setTimeout(resolve, 200));
    
    client.close();
  }, 25000);

  test("should exchange multiple packets", async () => {
    rustServer = spawnRustBinary(rustBinaryPath, [port.toString()]);
    await waitForServer("127.0.0.1", port, 5000);

    const client = await createTestClient({
      host: "127.0.0.1",
      port,
    });

    const { reader, writer } = client.stream.split();

    // Send multiple packets
    for (let i = 0; i < 5; i++) {
      const ping = TestProtocol.Ping({ message: `ping-${i}` });
      await writer.writePacket(ping);

      const response = await reader.readPacket<TestProtocol>();
      expect(response).toBeDefined();
      expect(response instanceof Uint8Array).toBe(true); // Deserialization not implemented yet
      
      // Small delay to ensure server processes each packet
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    await writer.writePacket(TestProtocol.Shutdown());
    
    // Wait a bit for shutdown to be processed
    await new Promise(resolve => setTimeout(resolve, 200));
    
    client.close();
  }, 15000);
});

