/**
 * Example client implementation
 * Demonstrates connecting to a Clavis server with encrypted communication
 */

import { EncryptedStream } from "../src/stream.js";
import { createConnection } from "net";

async function main() {
  const stream = await new Promise<ReturnType<typeof createConnection>>((resolve, reject) => {
    const conn = createConnection({ host: "127.0.0.1", port: 7272 }, () => {
      resolve(conn);
    });
    conn.on("error", reject);
  });

  console.log("Connected to server");

  // Create encrypted stream (without PSK for demo - in production, use a PSK)
  const encryptedStream = await EncryptedStream.new(stream, {
    maxPacketSize: 65536,
  });

  // Split into reader and writer for bidirectional communication
  const { reader, writer } = encryptedStream.split();

  // Example: Send and receive packets
  // Note: Actual packet sending requires implementing your protocol
  // See tests/helpers/test-protocol.ts for an example implementation

  console.log("Encrypted stream established");
  console.log("Reader:", reader);
  console.log("Writer:", writer);

  // Clean up
  stream.end();
}

main().catch(console.error);
