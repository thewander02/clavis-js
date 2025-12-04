/**
 * Represents the type of a cryptographic operation that failed
 */
export enum CryptoOperation {
  Authentication = "authentication",
  Encryption = "encryption",
  Decryption = "decryption",
  KeyExchange = "key exchange",
  Handshake = "handshake",
}

/**
 * Represents cryptographic errors
 */
export class CryptoError extends Error {
  constructor(
    message: string,
    public operation?: CryptoOperation,
    public details?: string
  ) {
    super(message);
    this.name = "CryptoError";
  }

  static operationFailure(operation: CryptoOperation, details: string): CryptoError {
    return new CryptoError(
      `Cryptographic operation failed during ${operation}: ${details}`,
      operation,
      details
    );
  }

  static authenticationFailure(message: string): CryptoError {
    return new CryptoError(`Authentication failed: ${message}`, CryptoOperation.Authentication);
  }

  static invalidKeyMaterial(message: string): CryptoError {
    return new CryptoError(`Invalid key material: ${message}`);
  }

  static keyDerivationFailure(message: string): CryptoError {
    return new CryptoError(`Key derivation failed: ${message}`);
  }
}

/**
 * Represents message format and processing errors
 */
export class MessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageError";
  }

  static messageTooLarge(size: number, maxSize: number): MessageError {
    return new MessageError(
      `Message size ${size} exceeds maximum allowed size of ${maxSize}`
    );
  }

  static serializationFailed(message: string): MessageError {
    return new MessageError(`Message serialization failed: ${message}`);
  }

  static deserializationFailed(message: string): MessageError {
    return new MessageError(`Message deserialization failed: ${message}`);
  }

  static invalidFormat(message: string): MessageError {
    return new MessageError(`Invalid message format: ${message}`);
  }
}

/**
 * Error codes for stream operations.
 * These provide programmatic identification of error types.
 */
export enum StreamErrorCode {
  /** Connection was closed normally or unexpectedly */
  ConnectionClosed = "CONNECTION_CLOSED",
  /** Connection was reset by peer (ECONNRESET) */
  ConnectionReset = "ECONNRESET",
  /** Connection refused by server (ECONNREFUSED) */
  ConnectionRefused = "ECONNREFUSED",
  /** Operation timed out */
  Timeout = "TIMEOUT",
  /** End of stream reached */
  EOF = "EOF",
  /** Decryption failed (authentication tag mismatch) */
  DecryptionFailed = "DECRYPTION_FAILED",
  /** Handshake failed */
  HandshakeFailed = "HANDSHAKE_FAILED",
  /** Invalid operation on stream */
  InvalidOperation = "INVALID_OPERATION",
  /** Generic IO error */
  IOError = "IO_ERROR",
}

/**
 * Represents stream operation errors
 */
export class StreamError extends Error {
  public override name = "StreamError";
  public override cause: Error | undefined;
  /** Error code for programmatic error handling */
  public code: StreamErrorCode | undefined;
  
  constructor(message: string, cause?: Error, code?: StreamErrorCode) {
    super(message);
    this.cause = cause;
    this.code = code;
  }

  static invalidOperation(message: string): StreamError {
    return new StreamError(
      `Invalid stream operation: ${message}`,
      undefined,
      StreamErrorCode.InvalidOperation
    );
  }

  static unexpectedClose(): StreamError {
    return new StreamError(
      "Stream closed unexpectedly",
      undefined,
      StreamErrorCode.ConnectionClosed
    );
  }

  static connectionClosed(message?: string): StreamError {
    return new StreamError(
      message ?? "Connection closed",
      undefined,
      StreamErrorCode.ConnectionClosed
    );
  }

  static connectionReset(cause?: Error): StreamError {
    return new StreamError(
      "Connection reset by peer",
      cause,
      StreamErrorCode.ConnectionReset
    );
  }

  static connectionRefused(cause?: Error): StreamError {
    return new StreamError(
      "Connection refused",
      cause,
      StreamErrorCode.ConnectionRefused
    );
  }

  static timeout(timeoutMs: number): StreamError {
    return new StreamError(
      `Stream timeout after ${timeoutMs}ms`,
      undefined,
      StreamErrorCode.Timeout
    );
  }

  static eof(): StreamError {
    return new StreamError(
      "End of stream",
      undefined,
      StreamErrorCode.EOF
    );
  }

  static decryptionFailed(message?: string): StreamError {
    return new StreamError(
      message ?? "Decryption failed",
      undefined,
      StreamErrorCode.DecryptionFailed
    );
  }

  static handshakeFailed(message: string, cause?: Error): StreamError {
    return new StreamError(
      `Handshake failed: ${message}`,
      cause,
      StreamErrorCode.HandshakeFailed
    );
  }

  static io(error: Error): StreamError {
    // Try to detect specific error codes from the underlying error
    const ioError = error as { code?: string };
    let code = StreamErrorCode.IOError;
    
    if (ioError.code === "ECONNRESET") {
      code = StreamErrorCode.ConnectionReset;
    } else if (ioError.code === "ECONNREFUSED") {
      code = StreamErrorCode.ConnectionRefused;
    } else if (ioError.code === "ETIMEDOUT") {
      code = StreamErrorCode.Timeout;
    }
    
    return new StreamError(`IO error: ${error.message}`, error, code);
  }

  /** Check if this error indicates a closed connection */
  isConnectionClosed(): boolean {
    return this.code === StreamErrorCode.ConnectionClosed ||
           this.code === StreamErrorCode.ConnectionReset ||
           this.code === StreamErrorCode.EOF;
  }

  /** Check if this error might be transient and worth retrying */
  isTransient(): boolean {
    return this.code === StreamErrorCode.Timeout ||
           this.code === StreamErrorCode.ConnectionReset;
  }
}

/**
 * Main error type for the Clavis library
 */
export class ClavisError extends Error {
  public override name = "ClavisError";
  public override cause: CryptoError | MessageError | StreamError | Error | undefined;
  constructor(
    message: string,
    cause?: CryptoError | MessageError | StreamError | Error
  ) {
    super(message);
    this.cause = cause;
  }

  static crypto(error: CryptoError): ClavisError {
    return new ClavisError(error.message, error);
  }

  static message(error: MessageError): ClavisError {
    return new ClavisError(error.message, error);
  }

  static stream(error: StreamError): ClavisError {
    return new ClavisError(error.message, error);
  }

  static config(message: string): ClavisError {
    return new ClavisError(`Configuration error: ${message}`);
  }

  static cryptoFailure(operation: CryptoOperation, details: string): ClavisError {
    return ClavisError.crypto(CryptoError.operationFailure(operation, details));
  }

  static serializationFailed(details: string): ClavisError {
    return ClavisError.message(MessageError.serializationFailed(details));
  }

  static deserializationFailed(details: string): ClavisError {
    return ClavisError.message(MessageError.deserializationFailed(details));
  }

  static invalidOperation(details: string): ClavisError {
    return ClavisError.stream(StreamError.invalidOperation(details));
  }

  isCryptoError(): boolean {
    return this.cause instanceof CryptoError;
  }

  isMessageError(): boolean {
    return this.cause instanceof MessageError;
  }

  isStreamError(): boolean {
    return this.cause instanceof StreamError;
  }

  isRetriable(): boolean {
    if (this.cause instanceof StreamError) {
      const ioError = this.cause.cause as { code?: string } | undefined;
      if (ioError?.code) {
        return (
          ioError.code === "EAGAIN" ||
          ioError.code === "ETIMEDOUT" ||
          ioError.code === "EINTR"
        );
      }
    }
    return false;
  }
}

/**
 * Type alias for Result with ClavisError as the error type
 * In TypeScript, we use exceptions, but this type can be used for explicit error handling
 */
export type ClavisResult<T> = T;
