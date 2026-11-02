// One-command local setup: write .env, install dependencies, build and start the compose stack,
// wait for the gateway, and seed the dev test accounts. Safe to re-run: every step is idempotent.
// Local development only.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeDevEnvIfAbsent } from './generate-dev-env.mjs';
import { seedDevEmployeeAccount, waitForGateway } from './seed-dev-accounts.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

const URLS = [
  ['Employee web (employee portal)', 'http://127.0.0.1:8080'],
  ['Admin web (HR portal)', 'http://127.0.0.1:8081'],
  ['API gateway', 'http://127.0.0.1:3000/api/v1'],
  ['RabbitMQ management', 'http://127.0.0.1:15672'],
];

const envOutcome = writeDevEnvIfAbsent();
console.log(
  envOutcome === 'created'
    ? 'Created .env with local passwords and development keys.'
    : 'Reusing the existing .env.',
);

if (!existsSync(`${REPOSITORY_ROOT}/node_modules`)) {
  console.log('Installing dependencies...');
  run('npm', ['install']);
}

console.log('Building and starting the stack (first build takes a few minutes)...');
run('docker', ['compose', '--profile', 'apps', 'up', '-d', '--build'], {
  COMPOSE_PARALLEL_LIMIT: '1',
});

console.log('Waiting for the services to finish their migrations and seeds...');
await waitForGateway();
await seedDevEmployeeAccount();

console.log(`
Setup complete. The stack is running and the test accounts are ready.

  Sign in (both portals accept these):
    HR admin    hr.admin@dexa.test   HrAdmin123
    Employee    employee1@dexa.test  Employee123

  URLs:`);
for (const [label, url] of URLS) {
  console.log(`    ${label.padEnd(33)}${url}`);
}
console.log(`
  Stop everything:        docker compose --profile apps down
  Reset from scratch:     docker compose --profile apps down -v && rm .env && npm run setup
  Seed accounts again:    npm run seed:dev`);

function run(command, arguments_, environment = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: REPOSITORY_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) {
    throw new Error(
      `\`${command} ${arguments_.join(' ')}\` failed with exit code ${result.status}.`,
    );
  }
}
