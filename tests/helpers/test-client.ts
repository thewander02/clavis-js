/**
 * Test client helpers for creating JS test clients
 */

import { createConnection, Socket } from "net";
import { EncryptedStream, type EncryptedStreamOptions } from "../../src/stream.js";

export interface TestClientOptions {
  host: string;
  port: number;
  psk?: Uint8Array;
  maxPacketSize?: number;
}

export interface TestClient {
  stream: EncryptedStream;
  socket: Socket;
  close: () => void;
}

/**
 * Create a test client that connects to a server
 */
export async function createTestClient(
  options: TestClientOptions
): Promise<TestClient> {
  const socket = await new Promise<Socket>((resolve, reject) => {
    const conn = createConnection(
      { host: options.host, port: options.port },
      () => {
        resolve(conn);
      }
    );
    conn.on("error", reject);
  });

  const streamOptions: EncryptedStreamOptions = {};
  if (options.maxPacketSize !== undefined) {
    streamOptions.maxPacketSize = options.maxPacketSize;
  }
  if (options.psk !== undefined) {
    streamOptions.psk = options.psk;
  }

  const stream = await EncryptedStream.new(socket, streamOptions);

  return {
    stream,
    socket,
    close: () => {
      socket.destroy();
    },
  };
}

