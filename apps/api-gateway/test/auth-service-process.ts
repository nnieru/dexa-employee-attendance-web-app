import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// The gateway tests run auth-service the way a deployment does: its compiled entry point, in its own
// process. Importing its source here would make one service depend on another service's code.
const AUTH_SERVICE_ENTRY_POINT = fileURLToPath(
  new URL('../../auth-service/dist/main.js', import.meta.url),
);
const LOCALHOST = '127.0.0.1';
// The publisher connects on its first publish, so a URL that refuses connections satisfies the configuration.
// A case that asserts broker delivery would need a real broker instead.
export const UNREACHABLE_BROKER_URL = 'amqp://auth-service:unused-password@127.0.0.1:1';
const HEALTH_PATH = '/api/v1/health';
const READY_TIMEOUT_MILLISECONDS = 60_000;
const READY_POLL_MILLISECONDS = 200;
const STOP_TIMEOUT_MILLISECONDS = 10_000;

export type RunningAuthService = {
  readonly baseUrl: string;
  readOutput(): string;
  stop(): Promise<void>;
};

/**
 * Starts the built auth-service with the given environment on a free local port, and resolves once its
 * health route answers. The environment is the only input: the child inherits nothing from this process.
 */
export async function startAuthServiceProcess(
  environment: Readonly<Record<string, string>>,
): Promise<RunningAuthService> {
  if (!existsSync(AUTH_SERVICE_ENTRY_POINT)) {
    throw new Error(
      `The auth-service build is missing at ${AUTH_SERVICE_ENTRY_POINT}. Run npm run build -w @dexa/auth-service.`,
    );
  }
  const port = await reserveLocalPort();
  const child = spawn(process.execPath, [AUTH_SERVICE_ENTRY_POINT], {
    env: { ...environment, HOST: LOCALHOST, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));

  const baseUrl = `http://${LOCALHOST}:${port}`;
  await waitUntilHealthy(baseUrl, child, output);
  return {
    baseUrl,
    readOutput: () => output.join(''),
    stop: () => stopProcess(child),
  };
}

// Connection errors are expected until the service listens, so a failed probe only means "not yet".
async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilHealthy(
  baseUrl: string,
  child: ChildProcess,
  output: ReadonlyArray<string>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`auth-service stopped before it was ready. Output: ${output.join('')}`);
    }
    if (await isHealthy(baseUrl)) return;
    await delay(READY_POLL_MILLISECONDS);
  }
  throw new Error(`auth-service was not ready within ${READY_TIMEOUT_MILLISECONDS} ms.`);
}

// The forced kill is a timer that is cleared on exit, so a finished test leaves no timer behind.
async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const forcedKill = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MILLISECONDS);
  await exited;
  clearTimeout(forcedKill);
}

function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, LOCALHOST, () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('Expected a TCP address.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}
