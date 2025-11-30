/**
 * Example server implementation
 * Demonstrates accepting Clavis encrypted connections
 */

import { EncryptedStream } from "../src/stream.js";
import { createServer, type Socket } from "net";

async function handleClient(stream: Socket) {
  try {
    // Create encrypted stream (without PSK for demo - in production, use a PSK)
    const encryptedStream = await EncryptedStream.new(stream, {
      maxPacketSize: 65536,
    });

    // Split into reader and writer for bidirectional communication
    const [reader, writer] = encryptedStream.split();

    console.log("Client encrypted stream established");
    console.log("Reader:", reader);
    console.log("Writer:", writer);

    // Example: Read and write packets
    // Note: Actual packet handling requires implementing your protocol
    // See tests/helpers/test-protocol.ts for an example implementation

  } catch (error) {
    console.error("Error handling client:", error);
  }
}

const server = createServer(async (stream) => {
  console.log("New client connected:", stream.remoteAddress);
  await handleClient(stream);
});

server.listen(7272, "127.0.0.1", () => {
  console.log("Server listening on 127.0.0.1:7272");
});
