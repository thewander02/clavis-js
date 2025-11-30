/**
 * Stream tests - encrypted packet read/write
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestServer, createEchoServer } from "../helpers/test-server.js";
import { createTestClient } from "../helpers/test-client.js";
import { findAvailablePort } from "../helpers/test-utils.js";
import { TestProtocol } from "../helpers/test-protocol.js";
import { Server } from "net";

describe("EncryptedStream", () => {
  let port: number;
  let server: Server;

  beforeEach(async () => {
    port = await findAvailablePort();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  test("should create encrypted stream", async () => {
    server = await createEchoServer(port);
    const client = await createTestClient({ host: "127.0.0.1", port });

    expect(client.stream).toBeDefined();
    client.close();
  });

  test("should split stream into reader and writer", async () => {
    server = await createEchoServer(port);
    const client = await createTestClient({ host: "127.0.0.1", port });

    const [reader, writer] = client.stream.split();
    expect(reader).toBeDefined();
    expect(writer).toBeDefined();

    client.close();
  });

  test("should handle packet size limits", async () => {
    const maxPacketSize = 1024;
    server = await createEchoServer(port, { maxPacketSize });

    const client = await createTestClient({
      host: "127.0.0.1",
      port,
      maxPacketSize,
    });

    // Create a packet that exceeds max size
    const largeData = new Uint8Array(maxPacketSize + 1);
    const packet = TestProtocol.Ping({ message: "test" });
    
    // Override serialize to return large data
    packet.serialize = () => largeData;

    const writer = client.stream.split()[1];
    await expect(writer.writePacket(packet)).rejects.toThrow();

    client.close();
  });

  test("should handle multiple packets", async () => {
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        const [reader, writer] = stream.split();
        let count = 0;
        try {
          while (count < 5) {
            // Read packet (even though we can't deserialize it yet)
            await reader.readPacket<TestProtocol>();
            // Send a Pong response
            const pong = TestProtocol.Pong({ message: `pong-${count}` });
            await writer.writePacket(pong);
            count++;
          }
        } catch (error) {
          // Client disconnected
        }
      },
    });

    const client = await createTestClient({ host: "127.0.0.1", port });
    const [reader, writer] = client.stream.split();

    for (let i = 0; i < 5; i++) {
      const ping = TestProtocol.Ping({ message: `test-${i}` });
      await writer.writePacket(ping);
      // Read response (will be raw bytes, but that's okay for this test)
      const response = await reader.readPacket<TestProtocol>();
      expect(response).toBeDefined();
      expect(response instanceof Uint8Array).toBe(true);
    }

    client.close();
  });
});

