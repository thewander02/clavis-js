/**
 * High-level Clavis client with connection management.
 * Provides automatic reconnection, event handling, and simplified API.
 */

import { EventEmitter } from "events";
import { createConnection, Socket } from "net";
import { EncryptedStream, EncryptedReader, EncryptedWriter } from "./stream.js";
import { ClavisError, StreamError } from "./error.js";
import type { PacketTrait } from "./protocol.js";

/**
 * Reconnection configuration
 */
export interface ReconnectOptions {
  /** Enable automatic reconnection (default: true) */
  enabled?: boolean;
  /** Maximum number of reconnection attempts (default: 5) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff strategy (default: 'exponential') */
  backoff?: "linear" | "exponential";
  /** Backoff multiplier for exponential (default: 2) */
  multiplier?: number;
}

/**
 * Options for ClavisClient
 */
export interface ClavisClientOptions {
  /** Host to connect to */
  host: string;
  /** Port to connect to */
  port: number;
  /** Pre-shared key for authentication (optional) */
  psk?: string | Uint8Array;
  /** Maximum packet size in bytes (default: 65536) */
  maxPacketSize?: number;
  /** Connection timeout in milliseconds (default: 10000) */
  connectTimeoutMs?: number;
  /** Reconnection options */
  reconnect?: ReconnectOptions;
}

/**
 * Connection status
 */
export type ConnectionStatus = 
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

/**
 * Events emitted by ClavisClient
 */
export interface ClavisClientEvents {
  /** Emitted when a packet is received */
  packet: [data: Uint8Array];
  /** Emitted when an error occurs */
  error: [error: ClavisError];
  /** Emitted when connected */
  connect: [];
  /** Emitted when disconnected */
  disconnect: [reason?: string];
  /** Emitted when reconnecting */
  reconnecting: [attempt: number, maxRetries: number];
  /** Emitted when connection status changes */
  statusChange: [status: ConnectionStatus];
}

/**
 * Type-safe event emitter interface
 */
export interface ClavisClientEmitter {
  on<K extends keyof ClavisClientEvents>(event: K, listener: (...args: ClavisClientEvents[K]) => void): this;
  once<K extends keyof ClavisClientEvents>(event: K, listener: (...args: ClavisClientEvents[K]) => void): this;
  off<K extends keyof ClavisClientEvents>(event: K, listener: (...args: ClavisClientEvents[K]) => void): this;
  emit<K extends keyof ClavisClientEvents>(event: K, ...args: ClavisClientEvents[K]): boolean;
}

const DEFAULT_RECONNECT: Required<ReconnectOptions> = {
  enabled: true,
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoff: "exponential",
  multiplier: 2,
};

/**
 * High-level Clavis client with automatic connection management.
 * 
 * @example
 * ```typescript
 * const client = new ClavisClient({
 *   host: 'localhost',
 *   port: 9000,
 *   psk: process.env.CLAVIS_PSK,
 * });
 * 
 * client.on('packet', (data) => {
 *   console.log('Received packet:', data);
 * });
 * 
 * client.on('error', (error) => {
 *   console.error('Error:', error);
 * });
 * 
 * await client.connect();
 * await client.send(myPacket);
 * ```
 */
export class ClavisClient extends EventEmitter implements ClavisClientEmitter {
  private options: ClavisClientOptions;
  private reconnectOptions: Required<ReconnectOptions>;
  private socket: Socket | null = null;
  private stream: EncryptedStream | null = null;
  private reader: EncryptedReader | null = null;
  private writer: EncryptedWriter | null = null;
  private _status: ConnectionStatus = "disconnected";
  private readingPackets = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;

  constructor(options: ClavisClientOptions) {
    super();
    this.options = options;
    this.reconnectOptions = {
      ...DEFAULT_RECONNECT,
      ...options.reconnect,
    };
  }

  /** Current connection status */
  get status(): ConnectionStatus {
    return this._status;
  }

  /** Whether the client is connected */
  get isConnected(): boolean {
    return this._status === "connected";
  }

  /**
   * Connect to the server
   */
  async connect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") {
      return;
    }

    this.manualDisconnect = false;
    await this._connect();
  }

  /**
   * Internal connection logic
   */
  private async _connect(): Promise<void> {
    this.setStatus("connecting");

    try {
      // Create TCP socket
      this.socket = await this.createSocket();

      // Create encrypted stream
      this.stream = await EncryptedStream.new(this.socket, {
        psk: this.options.psk,
        ...(this.options.maxPacketSize !== undefined && { maxPacketSize: this.options.maxPacketSize }),
      });

      // Split into reader/writer
      const { reader, writer } = this.stream.split();
      this.reader = reader;
      this.writer = writer;

      // Reset reconnect counter on successful connection
      this.reconnectAttempt = 0;

      this.setStatus("connected");
      this.emit("connect");

      // Start reading packets
      this.startReadingPackets();
    } catch (error) {
      this.cleanup();
      const clavisError = error instanceof ClavisError 
        ? error 
        : ClavisError.stream(StreamError.io(error instanceof Error ? error : new Error(String(error))));
      this.emit("error", clavisError);
      throw clavisError;
    }
  }

  /**
   * Create and connect a TCP socket
   */
  private createSocket(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.options.host,
        port: this.options.port,
      });

      const timeout = this.options.connectTimeoutMs ?? 10000;
      const timer = setTimeout(() => {
        socket.destroy();
        reject(StreamError.timeout(timeout));
      }, timeout);

      socket.on("connect", () => {
        clearTimeout(timer);
        resolve(socket);
      });

      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(StreamError.io(error));
      });

      // Handle socket events after connection
      socket.on("close", () => {
        this.handleDisconnect("Socket closed");
      });
    });
  }

  /**
   * Start reading packets in a loop
   */
  private async startReadingPackets(): Promise<void> {
    if (this.readingPackets || !this.reader) return;
    this.readingPackets = true;

    while (this.readingPackets && this.reader && this._status === "connected") {
      try {
        const packet = await this.reader.readPacket<PacketTrait>();
        // Emit raw packet data (packet is Uint8Array at this point)
        this.emit("packet", packet as unknown as Uint8Array);
      } catch (error) {
        if (!this.readingPackets) break;

        const streamError = error instanceof StreamError ? error : StreamError.io(
          error instanceof Error ? error : new Error(String(error))
        );

        // Check if this is a connection error
        if (streamError.isConnectionClosed()) {
          this.handleDisconnect(streamError.message);
          break;
        }

        // Emit non-fatal errors
        this.emit("error", ClavisError.stream(streamError));
      }
    }

    this.readingPackets = false;
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(reason?: string): void {
    if (this._status === "disconnected") return;

    this.cleanup();
    this.setStatus("disconnected");
    this.emit("disconnect", reason);

    // Attempt reconnection if enabled and not manually disconnected
    if (this.reconnectOptions.enabled && !this.manualDisconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.reconnectOptions.maxRetries) {
      this.emit("error", ClavisError.stream(
        StreamError.connectionClosed("Max reconnection attempts reached")
      ));
      return;
    }

    const delay = this.calculateReconnectDelay();
    this.reconnectAttempt++;

    this.setStatus("reconnecting");
    this.emit("reconnecting", this.reconnectAttempt, this.reconnectOptions.maxRetries);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this._connect();
      } catch {
        // Error already emitted in _connect, schedule next attempt
        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }

  /**
   * Calculate reconnection delay with backoff
   */
  private calculateReconnectDelay(): number {
    const { initialDelayMs, maxDelayMs, backoff, multiplier } = this.reconnectOptions;

    let delay: number;
    if (backoff === "exponential") {
      delay = initialDelayMs * Math.pow(multiplier, this.reconnectAttempt);
    } else {
      delay = initialDelayMs * (this.reconnectAttempt + 1);
    }

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    delay = Math.min(delay + jitter, maxDelayMs);

    return Math.round(delay);
  }

  /**
   * Send a packet
   */
  async send(packet: PacketTrait): Promise<void> {
    if (!this.writer || this._status !== "connected") {
      throw ClavisError.stream(StreamError.invalidOperation("Not connected"));
    }

    try {
      await this.writer.writePacket(packet);
    } catch (error) {
      const streamError = error instanceof StreamError ? error : StreamError.io(
        error instanceof Error ? error : new Error(String(error))
      );
      
      if (streamError.isConnectionClosed()) {
        this.handleDisconnect(streamError.message);
      }
      
      throw ClavisError.stream(streamError);
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.cancelReconnect();
    this.cleanup();
    this.setStatus("disconnected");
    this.emit("disconnect", "Manual disconnect");
  }

  /**
   * Cancel any pending reconnection
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.readingPackets = false;
    this.reader = null;
    this.writer = null;
    this.stream = null;

    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        // Ignore errors during cleanup
      }
      this.socket = null;
    }
  }

  /**
   * Set status and emit event
   */
  private setStatus(status: ConnectionStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.emit("statusChange", status);
    }
  }

  /**
   * Get the underlying reader (for advanced use cases)
   */
  getReader(): EncryptedReader | null {
    return this.reader;
  }

  /**
   * Get the underlying writer (for advanced use cases)
   */
  getWriter(): EncryptedWriter | null {
    return this.writer;
  }
}

