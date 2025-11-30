/**
 * Protocol tests - packet serialization and protocol definition
 */

import { describe, test, expect } from "bun:test";
import { TestProtocol, type ChatMessage, type PingPongData, type Status } from "../helpers/test-protocol.js";

describe("TestProtocol", () => {
  test("should create Heartbeat packet", () => {
    const packet = TestProtocol.Heartbeat();
    expect(packet.variantName).toBe("Heartbeat");
    expect(packet.variantIndex).toBe(0);
    expect(packet.variantData).toBeUndefined();
  });

  test("should create Join packet", () => {
    const packet = TestProtocol.Join("alice");
    expect(packet.variantName).toBe("Join");
    expect(packet.variantIndex).toBe(1);
    expect(packet.variantData).toBe("alice");
  });

  test("should create Leave packet", () => {
    const packet = TestProtocol.Leave("bob");
    expect(packet.variantName).toBe("Leave");
    expect(packet.variantIndex).toBe(2);
    expect(packet.variantData).toBe("bob");
  });

  test("should create Message packet", () => {
    const chatMessage: ChatMessage = {
      username: "alice",
      content: "Hello, World!",
      timestamp: Date.now(),
    };
    const packet = TestProtocol.Message(chatMessage);
    expect(packet.variantName).toBe("Message");
    expect(packet.variantIndex).toBe(3);
    expect(packet.variantData).toEqual(chatMessage);
  });

  test("should create Status packet", () => {
    const status: Status = {
      users_online: 42,
      server_uptime: 12345,
    };
    const packet = TestProtocol.Status(status);
    expect(packet.variantName).toBe("Status");
    expect(packet.variantIndex).toBe(4);
    expect(packet.variantData).toEqual(status);
  });

  test("should create Ping packet", () => {
    const data: PingPongData = { message: "ping" };
    const packet = TestProtocol.Ping(data);
    expect(packet.variantName).toBe("Ping");
    expect(packet.variantIndex).toBe(5);
    expect(packet.variantData).toEqual(data);
  });

  test("should create Pong packet", () => {
    const data: PingPongData = { message: "pong" };
    const packet = TestProtocol.Pong(data);
    expect(packet.variantName).toBe("Pong");
    expect(packet.variantIndex).toBe(6);
    expect(packet.variantData).toEqual(data);
  });

  test("should create Shutdown packet", () => {
    const packet = TestProtocol.Shutdown();
    expect(packet.variantName).toBe("Shutdown");
    expect(packet.variantIndex).toBe(7);
    expect(packet.variantData).toBeUndefined();
  });

  test("should serialize packets", () => {
    const packet = TestProtocol.Ping({ message: "test" });
    const serialized = packet.serialize();
    
    expect(serialized).toBeInstanceOf(Uint8Array);
    expect(serialized.length).toBeGreaterThan(0);
    
    // First 4 bytes should be variant index (5 = Ping)
    expect(serialized[0]).toBe(5);
  });

  test("should serialize different packet types", () => {
    const packets = [
      TestProtocol.Heartbeat(),
      TestProtocol.Join("test"),
      TestProtocol.Ping({ message: "test" }),
      TestProtocol.Shutdown(),
    ];

    for (const packet of packets) {
      const serialized = packet.serialize();
      expect(serialized.length).toBeGreaterThan(0);
      expect(serialized[0]).toBe(packet.variantIndex);
    }
  });
});

