// Runs the two browser docs together: Swagger UI on the compose gateway and Storybook for @dexa/ui.
// The gateway container runs NODE_ENV=production, so the gateway is recreated with SWAGGER_ENABLED=true
// and polled until both documents answer, then Storybook runs in this terminal until Ctrl+C stops it.
// Local use only.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeDevEnvIfAbsent } from './generate-dev-env.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SWAGGER_URL = 'http://127.0.0.1:3000/docs';
const OPENAPI_DOCUMENT_URL = 'http://127.0.0.1:3000/docs-json';
const STORYBOOK_URL = 'http://127.0.0.1:6006';
const DOC_READY_TIMEOUT_MILLISECONDS = 180_000;

writeDevEnvIfAbsent();

// The variable is set on the docker compose process, not in .env, so a production-mode container keeps
// the docs off unless this command turns them on.
const result = spawnSync(
  'docker',
  ['compose', '--profile', 'apps', 'up', '-d', '--build', 'api-gateway'],
  {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, SWAGGER_ENABLED: 'true' },
    stdio: 'inherit',
  },
);
if (result.status !== 0) {
  throw new Error('Starting the gateway through docker compose failed.');
}

console.log('Waiting for the OpenAPI document...');
await waitFor(OPENAPI_DOCUMENT_URL, 'Swagger UI');
open(SWAGGER_URL);

spawn('npm', ['run', 'storybook', '-w', '@dexa/ui'], {
  cwd: REPOSITORY_ROOT,
  stdio: 'inherit',
});
await waitFor(STORYBOOK_URL, 'Storybook');
open(STORYBOOK_URL);

console.log(`
Browser docs are running:

  Swagger UI    ${SWAGGER_URL}
  Storybook     ${STORYBOOK_URL}

Storybook runs in this terminal; Ctrl+C stops it (the gateway keeps running detached).`);

await never(); // Storybook keeps running until Ctrl+C, which also ends this script.

function open(url) {
  // The docs are rendered in a browser anyway, so opening them saves one manual step on macOS, where
  // `open` exists; on other systems the printed URLs above are the same information.
  spawnSync('open', [url], { cwd: REPOSITORY_ROOT });
}

async function waitFor(url, label) {
  const deadline = Date.now() + DOC_READY_TIMEOUT_MILLISECONDS;
  for (;;) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      // The gateway may still be running its startup migrations and module wiring; keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for ${label} at ${url}. Check 'docker compose --profile apps logs api-gateway'.`,
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
}

function never() {
  return new Promise(() => undefined);
}
