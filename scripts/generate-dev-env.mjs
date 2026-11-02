// Writes the local .env once, from .env.example: random local passwords, development token keys
// from scripts/generate-dev-keys.mjs, the bootstrap HR account, master data, and the container
// URLs that compose needs. An existing .env is never overwritten, so manual edits survive.
// Local use only; .env stays uncommitted.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEV_TEST_ACCOUNTS } from './dev-test-accounts.mjs';
const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_EXAMPLE_PATH = `${REPOSITORY_ROOT}/.env.example`;
const ENV_PATH = `${REPOSITORY_ROOT}/.env`;

// # AUTH_BOOTSTRAP_HR_EMAIL=... is a commented example line, so the comment is optional here.
const ASSIGNMENT_PATTERN = /^(?<comment>#\s?)?(?<variable>[A-Z0-9_]+)=(?<value>.*)$/;

const PASSWORD_VARIABLES = [
  'POSTGRES_ADMIN_PASSWORD',
  'RABBITMQ_PASSWORD',
  'AUTH_DB_PASSWORD',
  'EMPLOYEE_DB_PASSWORD',
  'ATTENDANCE_DB_PASSWORD',
  'NOTIFICATION_DB_PASSWORD',
  'AUDIT_DB_PASSWORD',
];

// Each connection URL names the password variable whose generated value replaces `change-me`.
const URL_PASSWORD_VARIABLES = {
  AUTH_DATABASE_URL: 'AUTH_DB_PASSWORD',
  AUTH_DATABASE_URL_CONTAINER: 'AUTH_DB_PASSWORD',
  EMPLOYEE_DATABASE_URL: 'EMPLOYEE_DB_PASSWORD',
  EMPLOYEE_DATABASE_URL_CONTAINER: 'EMPLOYEE_DB_PASSWORD',
  ATTENDANCE_DATABASE_URL: 'ATTENDANCE_DB_PASSWORD',
  ATTENDANCE_DATABASE_URL_CONTAINER: 'ATTENDANCE_DB_PASSWORD',
  NOTIFICATION_DATABASE_URL: 'NOTIFICATION_DB_PASSWORD',
  NOTIFICATION_DATABASE_URL_CONTAINER: 'NOTIFICATION_DB_PASSWORD',
  AUDIT_DATABASE_URL: 'AUDIT_DB_PASSWORD',
  AUDIT_DATABASE_URL_CONTAINER: 'AUDIT_DB_PASSWORD',
  RABBITMQ_URL: 'RABBITMQ_PASSWORD',
  RABBITMQ_URL_CONTAINER: 'RABBITMQ_PASSWORD',
};

// Master data that production-mode containers accept; the literal `fixtures` value is refused
// there, so the JSON document is written instead (DATABASE §2).
const MASTER_DATA = {
  positions: [
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'PRODUCT_DESIGNER', name: 'Product Designer' },
    { code: 'QA_ENGINEER', name: 'QA Engineer' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};

export function writeDevEnvIfAbsent() {
  if (existsSync(ENV_PATH)) return 'reused';
  writeFileSync(ENV_PATH, buildDevEnv());
  return 'created';
}

function buildDevEnv() {
  const passwords = generatePasswords();
  const settings = new Map([
    ...parseAssignments(generateDevKeys()),
    ['AUTH_BOOTSTRAP_HR_EMAIL', DEV_TEST_ACCOUNTS.hr.email],
    ['AUTH_BOOTSTRAP_HR_PASSWORD', DEV_TEST_ACCOUNTS.hr.password],
    ['EMPLOYEE_BOOTSTRAP_HR_EMAIL', DEV_TEST_ACCOUNTS.hr.email],
    ['EMPLOYEE_BOOTSTRAP_HR_NAME', DEV_TEST_ACCOUNTS.hr.name],
    ['EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE', DEV_TEST_ACCOUNTS.hr.positionCode],
    ['EMPLOYEE_MASTER_DATA', JSON.stringify(MASTER_DATA)],
  ]);
  return readFileSync(ENV_EXAMPLE_PATH, 'utf8')
    .split('\n')
    .map((line) => resolveLine(line, passwords, settings))
    .join('\n');
}

function generatePasswords() {
  const passwords = new Map();
  for (const variable of PASSWORD_VARIABLES) {
    // The broker uses the fixed dev credentials (dev-test-accounts), so the management UI matches the
    // README; every other password stays random.
    if (variable === 'RABBITMQ_PASSWORD') {
      passwords.set(variable, DEV_TEST_ACCOUNTS.broker.password);
      continue;
    }
    passwords.set(variable, randomBytes(16).toString('hex'));
  }
  return passwords;
}

function generateDevKeys() {
  const result = spawnSync(process.execPath, ['scripts/generate-dev-keys.mjs'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.stdout.length === 0) {
    throw new Error('Generating the development token keys failed.');
  }
  return result.stdout;
}

function parseAssignments(output) {
  const values = new Map();
  for (const line of output.split('\n')) {
    const match = /^(?<variable>[A-Z0-9_]+)=(?<value>.+)$/.exec(line);
    if (match?.groups === undefined) continue;
    values.set(match.groups.variable, match.groups.value);
  }
  return values;
}

function resolveLine(line, passwords, settings) {
  const match = ASSIGNMENT_PATTERN.exec(line);
  if (match?.groups === undefined) return line;
  const { variable, value } = match.groups;

  // The generated token keys and bootstrap settings uncomment their example lines.
  if (settings.has(variable)) return `${variable}=${settings.get(variable)}`;
  if (passwords.has(variable)) return `${variable}=${passwords.get(variable)}`;

  // Host and container connection URLs keep their layout; only the placeholder password changes.
  const urlPasswordVariable = URL_PASSWORD_VARIABLES[variable];
  if (urlPasswordVariable !== undefined) {
    const password = passwords.get(urlPasswordVariable);
    if (password === undefined) return line;
    return `${variable}=${value.replaceAll('change-me', password)}`;
  }

  // Everything else (optional settings, the empty generic SERVICE_JWT_PRIVATE_KEY) stays as is.
  return line;
}
