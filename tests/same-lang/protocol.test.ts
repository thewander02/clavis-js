/**
 * Protocol tests - packet serialization and protocol definition
 */

import { describe, test, expect } from "bun:test";
import { TestProtocol, type ChatMessage, type PingPongData, type Status } from "../helpers/test-protocol.js";
import { createProtocolCodec } from "../../src/protocol.js";
import { writeU32, writeString } from "../../src/bincode.js";

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

describe("createProtocolCodec", () => {
  // Define a test message type
  type TestMessage = 
    | "AgentHello"
    | "ControllerAck"
    | "Heartbeat"
    | "TaskOffer"
    | "TaskResult";

  const codec = createProtocolCodec<TestMessage>([
    "AgentHello",
    "ControllerAck",
    "Heartbeat",
    "TaskOffer",
    "TaskResult",
  ]);

  test("should map variant names to indices", () => {
    expect(codec.variantIndex("AgentHello")).toBe(0);
    expect(codec.variantIndex("ControllerAck")).toBe(1);
    expect(codec.variantIndex("Heartbeat")).toBe(2);
    expect(codec.variantIndex("TaskOffer")).toBe(3);
    expect(codec.variantIndex("TaskResult")).toBe(4);
  });

  test("should map indices to variant names", () => {
    expect(codec.variantName(0)).toBe("AgentHello");
    expect(codec.variantName(1)).toBe("ControllerAck");
    expect(codec.variantName(2)).toBe("Heartbeat");
    expect(codec.variantName(4)).toBe("TaskResult");
    expect(codec.variantName(999)).toBeUndefined();
  });

  test("should return all variants", () => {
    const variants = codec.variants();
    expect(variants).toEqual([
      "AgentHello",
      "ControllerAck",
      "Heartbeat",
      "TaskOffer",
      "TaskResult",
    ]);
  });

  test("should validate types and indices", () => {
    expect(codec.isValidType("AgentHello")).toBe(true);
    expect(codec.isValidType("Unknown")).toBe(false);
    expect(codec.isValidIndex(0)).toBe(true);
    expect(codec.isValidIndex(4)).toBe(true);
    expect(codec.isValidIndex(5)).toBe(false);
  });

  test("should encode messages with u32 variant index", () => {
    const encoded = codec.encode("Heartbeat");
    expect(encoded.length).toBe(4); // u32
    expect(encoded[0]).toBe(2); // Heartbeat is at index 2
    expect(encoded[1]).toBe(0);
    expect(encoded[2]).toBe(0);
    expect(encoded[3]).toBe(0);
  });

  test("should encode messages with data", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const encoded = codec.encode("TaskOffer", data);
    expect(encoded.length).toBe(8); // 4 bytes variant + 4 bytes data
    expect(encoded[0]).toBe(3); // TaskOffer is at index 3
    expect(encoded.slice(4)).toEqual(data);
  });

  test("should decode messages", () => {
    // Create a message with variant index 1 (ControllerAck)
    const buffer: number[] = [];
    writeU32(buffer, 1);
    writeString(buffer, "session-123");
    const data = new Uint8Array(buffer);

    const decoded = codec.decode(data);
    expect(decoded.type).toBe("ControllerAck");
    expect(decoded.index).toBe(1);
    expect(decoded.reader).toBeDefined();
    expect(decoded.reader.readString()).toBe("session-123");
  });

  test("should throw on unknown variant when encoding", () => {
    expect(() => codec.encode("Unknown" as TestMessage)).toThrow();
  });

  test("should throw on unknown variant when decoding", () => {
    const buffer: number[] = [];
    writeU32(buffer, 999); // Invalid index
    const data = new Uint8Array(buffer);
    
    expect(() => codec.decode(data)).toThrow();
  });

  test("should work with varint encoding option", () => {
    const varintCodec = createProtocolCodec<TestMessage>(
      ["AgentHello", "ControllerAck", "Heartbeat", "TaskOffer", "TaskResult"],
      { useVarint: true }
    );

    // For indices < 251, varint is single byte
    const encoded = varintCodec.encode("Heartbeat");
    expect(encoded.length).toBe(1);
    expect(encoded[0]).toBe(2);
  });
});

