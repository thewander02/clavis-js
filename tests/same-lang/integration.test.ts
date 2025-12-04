/**
 * Integration tests - full client-server communication
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestServer } from "../helpers/test-server.js";
import { createTestClient } from "../helpers/test-client.js";
import { findAvailablePort } from "../helpers/test-utils.js";
import { TestProtocol } from "../helpers/test-protocol.js";
import type { ChatMessage } from "../helpers/test-protocol.js";
import { Server } from "net";

describe("Integration Tests", () => {
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

  test("should handle full client-server communication", async () => {
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        const { reader, writer } = stream.split();
        
        try {
          // Read packets (can't deserialize yet, but we can count them)
          await reader.readPacket(); // Join
          
          // Send Status response
          const status = TestProtocol.Status({
            users_online: 1,
            server_uptime: 1000,
          });
          await writer.writePacket(status);
          
          await reader.readPacket(); // Message
          await reader.readPacket(); // Shutdown
        } catch (error) {
          // Client disconnected
        }
      },
    });

    const client = await createTestClient({ host: "127.0.0.1", port });
    const { reader, writer } = client.stream.split();

    // Send Join
    await writer.writePacket(TestProtocol.Join("alice"));
    
    // Receive Status (will be raw bytes until deserialization is implemented)
    const status = await reader.readPacket();
    expect(status).toBeDefined();
    expect(status instanceof Uint8Array).toBe(true);
    
    // Send Message
    const chatMessage: ChatMessage = {
      username: "alice",
      content: "Hello, World!",
      timestamp: Date.now(),
    };
    await writer.writePacket(TestProtocol.Message(chatMessage));
    
    // Send Shutdown
    await writer.writePacket(TestProtocol.Shutdown());

    client.close();
  });

  test("should handle multiple clients", async () => {
    const clients: any[] = [];
    
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        const { reader, writer } = stream.split();
        try {
          // Read packet and send Pong response
          await reader.readPacket();
          const pong = TestProtocol.Pong({ message: "pong" });
          await writer.writePacket(pong);
        } catch (error) {
          // Client disconnected
        }
      },
    });

    // Create multiple clients
    for (let i = 0; i < 3; i++) {
      const client = await createTestClient({ host: "127.0.0.1", port });
      clients.push(client);
    }

    // Test each client
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const { reader, writer } = client.stream.split();
      
      const ping = TestProtocol.Ping({ message: `client-${i}` });
      await writer.writePacket(ping);
      
      const response = await reader.readPacket();
      expect(response).toBeDefined();
      expect(response instanceof Uint8Array).toBe(true);
      
      client.close();
    }
  });

  test("should handle large packets", async () => {
    server = await createTestServer({
      port,
      maxPacketSize: 100000,
      onClient: async (stream) => {
        const { reader, writer } = stream.split();
        try {
          // Read packet and send echo response
          await reader.readPacket();
          const echo = TestProtocol.Message({
            username: "server",
            content: "echo",
            timestamp: Date.now(),
          });
          await writer.writePacket(echo);
        } catch (error) {
          // Client disconnected
        }
      },
    });

    const client = await createTestClient({
      host: "127.0.0.1",
      port,
      maxPacketSize: 100000,
    });
    const { reader, writer } = client.stream.split();

    // Create a message with large content
    const largeContent = "x".repeat(50000);
    const chatMessage: ChatMessage = {
      username: "alice",
      content: largeContent,
      timestamp: Date.now(),
    };
    const packet = TestProtocol.Message(chatMessage);
    
    await writer.writePacket(packet);
    const response = await reader.readPacket();
    
    expect(response).toBeDefined();
    expect(response instanceof Uint8Array).toBe(true);

    client.close();
  });

  test("should handle ping-pong exchange", async () => {
    server = await createTestServer({
      port,
      onClient: async (stream) => {
        const { reader, writer } = stream.split();
        let pingCount = 0;
        try {
          while (pingCount < 10) {
            // Read packet (can't check variant name yet)
            await reader.readPacket();
            // Always respond with Pong
            const pong = TestProtocol.Pong({ message: "pong" });
            await writer.writePacket(pong);
            pingCount++;
          }
        } catch (error) {
          // Client disconnected
        }
      },
    });

    const client = await createTestClient({ host: "127.0.0.1", port });
    const { reader, writer } = client.stream.split();

    // Send multiple pings
    for (let i = 0; i < 10; i++) {
      const ping = TestProtocol.Ping({ message: `ping-${i}` });
      await writer.writePacket(ping);
      
      const pong = await reader.readPacket();
      expect(pong).toBeDefined();
      expect(pong instanceof Uint8Array).toBe(true);
    }

    await writer.writePacket(TestProtocol.Shutdown());
    client.close();
  });
});

