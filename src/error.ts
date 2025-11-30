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
 * Represents stream operation errors
 */
export class StreamError extends Error {
  public override name = "StreamError";
  public override cause: Error | undefined;
  constructor(message: string, cause?: Error) {
    super(message);
    this.cause = cause;
  }

  static invalidOperation(message: string): StreamError {
    return new StreamError(`Invalid stream operation: ${message}`);
  }

  static unexpectedClose(): StreamError {
    return new StreamError("Stream closed unexpectedly");
  }

  static timeout(timeoutMs: number): StreamError {
    return new StreamError(`Stream timeout after ${timeoutMs}ms`);
  }

  static io(error: Error): StreamError {
    return new StreamError(`IO error: ${error.message}`, error);
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
