# clavis-js

Secure encrypted communication over asynchronous streams - TypeScript implementation of the Clavis protocol.

## Features

- 🔐 **X25519 Key Exchange** - Secure key exchange using elliptic curve cryptography
- 🛡️ **XChaCha20-Poly1305 Encryption** - Authenticated encryption for all packets
- 🔑 **Pre-shared Key (PSK) Support** - Optional authentication via PSK
- 📦 **Packet-based Protocol** - Simple packet serialization/deserialization
- 🌐 **Stream-based** - Works with Node.js streams (TCP, TLS, etc.)
- ⚡ **TypeScript First** - Full TypeScript support with type safety
- 🔄 **Bincode Compatible** - Matches Rust's bincode serialization format

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

interface PingPongData {
  message: string;
}

const Packet = protocol({
  Ping: [{ message: String }],
  Pong: [{ message: String }],
  Shutdown: [],
});

// Create a packet
const ping = Packet.Ping({ message: "hello" });

// Serialize (automatically uses VarintEncoding for variant indices)
const serialized = ping.serialize();
```

## Bincode Serialization

The library provides bincode-compatible serialization that matches Rust's `bincode` format with `serde`. This is especially important when communicating with Rust services.

### Key Features

- **VarintEncoding**: Enum variant indices use VarintEncoding (values < 251 are single byte)
- **DateTime Support**: Serializes `Date` objects as `chrono::DateTime<Utc>` format (struct { secs: i64, nsecs: u32 })
- **Option Types**: Supports Rust's `Option<T>` serialization (u8 discriminant + value)
- **String Pairs**: Helper for `Vec<(String, String)>` (e.g., environment variables)

### Example: Matching Rust Protocol

```typescript
import { 
  serializeMessageHeader, 
  serializeResourceSpec, 
  writeVarintU32,
  writeString,
  writeU16 
} from "clavis-js";

// Serialize a message matching Rust's protocol! macro
function serializeOrchestratorHello(buffer: number[], hello: {
  header: { correlation_id: string; timestamp?: Date };
  orchestrator_id: string;
  protocol_version: string;
  client_name: string;
}): void {
  // Write variant index (Varint-encoded)
  writeVarintU32(buffer, 19); // OrchestratorHello variant index
  
  // Serialize header
  serializeMessageHeader(buffer, hello.header);
  
  // Serialize fields in order
  writeString(buffer, hello.orchestrator_id);
  writeString(buffer, hello.protocol_version);
  writeString(buffer, hello.client_name);
}
```

### Available Helpers

- `writeVarintU32()` - Varint-encoded u32 (for enum variant indices)
- `writeString()` - String serialization (u64 length + UTF-8 bytes)
- `writeOptionString()` - Option<String> serialization
- `writeStringPairVec()` - Vec<(String, String)> serialization
- `writeDateTime()` - DateTime<Utc> serialization (struct { secs: i64, nsecs: u32 })
- `serializeMessageHeader()` - MessageHeader struct serialization
- `serializeResourceSpec()` - ResourceSpec struct serialization

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

## Bincode Format Details

### Enum Serialization

Enums are serialized with Varint-encoded variant indices:
- Values < 251: Single byte (u8)
- Values >= 251: 0xFB marker + 4 bytes (little-endian u32)

This matches bincode 1.3's default VarintEncoding configuration.

### DateTime Serialization

`Date` objects are serialized as `chrono::DateTime<Utc>`:
- `secs`: i64 (seconds since Unix epoch)
- `nsecs`: u32 (nanoseconds within that second, 0-999,999,999)

### Option Types

Rust's `Option<T>` is serialized as:
- `None`: u8 `0`
- `Some(value)`: u8 `1` + serialized value

## Security

- Uses X25519 for key exchange (ECDH over Curve25519)
- Uses XChaCha20-Poly1305 for authenticated encryption
- Supports pre-shared keys (PSK) for authentication
- Constant-time MAC comparison to prevent timing attacks

**Note**: Without a PSK, connections are vulnerable to man-in-the-middle attacks. Always use a PSK in production.

## Compatibility with Rust

This library is designed to work seamlessly with the Rust `clavis` library. When using `clavis::protocol!` in Rust, ensure your TypeScript serialization matches:

1. Use `writeVarintU32()` for enum variant indices (not fixed u32)
2. Use `writeDateTime()` for `DateTime<Utc>` fields
3. Serialize struct fields in the same order as Rust
4. Use `writeOptionString()` for `Option<String>` fields

## License

MIT

## Links

- [GitHub Repository](https://github.com/thewander02/clavis-js)
- [Issue Tracker](https://github.com/thewander02/clavis-js/issues)
