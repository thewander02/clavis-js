/**
 * Handshake tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestServer } from "../helpers/test-server.js";
import { createTestClient } from "../helpers/test-client.js";
import { findAvailablePort } from "../helpers/test-utils.js";
import { Server } from "net";

describe("Handshake", () => {
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

  test("should perform handshake without PSK via EncryptedStream", async () => {
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        // Server successfully created encrypted stream (handshake completed)
        expect(stream).toBeDefined();
      },
    });

    const client = await createTestClient({ host: "127.0.0.1", port });
    expect(client.stream).toBeDefined();
    client.close();
  });

  test("should perform handshake with PSK via EncryptedStream", async () => {
    const psk = new TextEncoder().encode("test-pre-shared-key-32bytes!!");

    server = await createTestServer({
      port,
      psk,
      onClient: async (stream) => {
        expect(stream).toBeDefined();
      },
    });

    const client = await createTestClient({
      host: "127.0.0.1",
      port,
      psk,
    });
    expect(client.stream).toBeDefined();
    client.close();
  });

  test("should fail with mismatched PSK", async () => {
    const psk1 = new TextEncoder().encode("test-pre-shared-key-32bytes!!");
    const psk2 = new TextEncoder().encode("different-pre-shared-key-32b");

    server = await createTestServer({
      port,
      psk: psk1,
      onClient: async () => {
        // Should not reach here
      },
    });

    await expect(
      createTestClient({
        host: "127.0.0.1",
        port,
        psk: psk2,
      })
    ).rejects.toThrow();
  });

  test("should fail with PSK shorter than 16 bytes", async () => {
    const shortPsk = new TextEncoder().encode("short");

    server = await createTestServer({
      port,
      psk: shortPsk,
      onClient: async () => {},
    });

    await expect(
      createTestClient({
        host: "127.0.0.1",
        port,
        psk: shortPsk,
      })
    ).rejects.toThrow();
  });

  test("should perform handshake and establish encryption keys", async () => {
    // Test that handshake works through EncryptedStream
    // This indirectly tests the performHandshake function
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        // Handshake completed successfully if we got here
        expect(stream).toBeDefined();
      },
    });

    const client = await createTestClient({ host: "127.0.0.1", port });
    
    // Verify handshake completed by checking we can split the stream
    const { reader, writer } = client.stream.split();
    expect(reader).toBeDefined();
    expect(writer).toBeDefined();
    
    client.close();
  });
});
