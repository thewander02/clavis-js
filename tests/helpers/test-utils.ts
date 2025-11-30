/**
 * Test utilities for Clavis JS tests
 */

import { createServer } from "net";
import { spawn, type Subprocess } from "bun";

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(startPort: number = 9000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    
    server.listen(startPort, () => {
      const port = (server.address() as any)?.port;
      server.close(() => {
        resolve(port || startPort);
      });
    });
    
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Wait for a server to be ready by attempting to connect
 */
export async function waitForServer(
  host: string,
  port: number,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const { Socket } = await import("net");
      await new Promise<void>((resolve, reject) => {
        const socket = new Socket();
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
        socket.connect(port, host);
      });
      return;
    } catch (error) {
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  
  throw new Error(`Server at ${host}:${port} did not become ready within ${timeout}ms`);
}

/**
 * Spawn a Rust binary and return the process
 */
export function spawnRustBinary(
  binaryPath: string,
  args: string[] = [],
  env: Record<string, string> = {}
): Subprocess {
  return spawn([binaryPath, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

/**
 * Wait for a process to exit with a timeout
 */
export async function waitForProcess(
  proc: Subprocess,
  timeout: number = 10000
): Promise<number> {
  const timer = setTimeout(() => {
    proc.kill();
    throw new Error(`Process timed out after ${timeout}ms`);
  }, timeout);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timer);
    return exitCode || 0;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Read all output from a process
 */
export async function readProcessOutput(proc: Subprocess): Promise<{
  stdout: string;
  stderr: string;
}> {
  let stdoutData = "";
  let stderrData = "";

  if (proc.stdout && typeof proc.stdout !== "number") {
    stdoutData = await new Response(proc.stdout).text();
  }

  if (proc.stderr && typeof proc.stderr !== "number") {
    stderrData = await new Response(proc.stderr).text();
  }

  return {
    stdout: stdoutData,
    stderr: stderrData,
  };
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a pair of connected streams for testing
 */
export async function createStreamPair(): Promise<[import("stream").Duplex, import("stream").Duplex]> {
  const { Duplex } = await import("stream");

  let stream2: import("stream").Duplex;

  const stream1 = new Duplex({
    read() {},
    write(chunk: unknown, _encoding: BufferEncoding, callback: () => void) {
      stream2.push(chunk);
      callback();
    },
  });

  stream2 = new Duplex({
    read() {},
    write(chunk: unknown, _encoding: BufferEncoding, callback: () => void) {
      stream1.push(chunk);
      callback();
    },
  });

  return [stream1, stream2];
}

