# clavis-js

Secure encrypted communication over asynchronous streams - TypeScript implementation of the Clavis protocol.

## Features

- 🔐 **X25519 Key Exchange** - Secure key exchange using elliptic curve cryptography
- 🛡️ **XChaCha20-Poly1305 Encryption** - Authenticated encryption for all packets
- 🔑 **Pre-shared Key (PSK) Support** - Optional authentication via PSK
- 📦 **Packet-based Protocol** - Simple packet serialization/deserialization
- 🌐 **Stream-based** - Works with Node.js streams (TCP, TLS, etc.)
- ⚡ **TypeScript First** - Full TypeScript support with type safety

## Installation

```bash
npm install clavis-js
# or
bun add clavis-js
```

## Requirements

- Node.js >= 18.0.0 or Bun >= 1.0.0
- TypeScript >= 5.0 (for TypeScript projects)

## Quick Start

```typescript
import { EncryptedStream } from "clavis-js";
import { createConnection } from "net";

// Client
const socket = await new Promise((resolve, reject) => {
  const conn = createConnection({ host: "127.0.0.1", port: 7272 }, () => resolve(conn));
  conn.on("error", reject);
});

const encryptedStream = await EncryptedStream.new(socket, {
  maxPacketSize: 65536,
  psk: new TextEncoder().encode("your-pre-shared-key-at-least-16-bytes"), // Optional
});

const [reader, writer] = encryptedStream.split();

// Send encrypted packet
await writer.writePacket(yourPacket);

// Read encrypted packet
const packet = await reader.readPacket();
```

## Protocol Definition

Define your packet types using the protocol DSL:

```typescript
import { protocol } from "clavis-js";

export const Packet = protocol({
  Ping: ["PingPongData"],
  Pong: ["PingPongData"],
  Shutdown: [],
});
```

For full bincode-compatible serialization, see the [test protocol implementation](./tests/helpers/test-protocol.ts).

## API

### `EncryptedStream`

Main class for encrypted communication.

#### `EncryptedStream.new(stream, options?)`

Creates a new encrypted stream by performing handshake.

- `stream`: Node.js `Readable & Writable` stream (e.g., TCP socket)
- `options`: Optional configuration
  - `maxPacketSize?: number` - Maximum packet size (default: 65536)
  - `psk?: Uint8Array` - Pre-shared key for authentication (minimum 16 bytes)

#### `split(): [EncryptedReader, EncryptedWriter]`

Splits the stream into separate reader and writer for bidirectional communication.

### `EncryptedReader`

Read-only encrypted stream.

- `readPacket<P>(): Promise<P>` - Read and decrypt a packet

### `EncryptedWriter`

Write-only encrypted stream.

- `writePacket(packet: PacketTrait): Promise<void>` - Encrypt and write a packet

## Security

- Uses X25519 for key exchange (ECDH over Curve25519)
- Uses XChaCha20-Poly1305 for authenticated encryption
- Supports pre-shared keys (PSK) for authentication
- Constant-time MAC comparison to prevent timing attacks

**Note**: Without a PSK, connections are vulnerable to man-in-the-middle attacks. Always use a PSK in production.

## License

MIT

## Links

- [GitHub Repository](https://github.com/thewander02/clavis-js)
- [Issue Tracker](https://github.com/thewander02/clavis-js/issues)
