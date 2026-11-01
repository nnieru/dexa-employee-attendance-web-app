// Seeds the employee test account through the real HR flow: sign in as the bootstrap HR admin,
// resolve the master options, and create the employee. The fixed operation ID makes a repeated
// run a replay of the same provisioning operation, so re-running is safe (DATABASE §4.3).
// Local development only; the credentials are the documented dev test accounts.

import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { DEV_TEST_ACCOUNTS } from './dev-test-accounts.mjs';

const GATEWAY_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const RETRY_DELAY_MILLISECONDS = 2_000;
const SERVICE_WAIT_TIMEOUT_MILLISECONDS = 240_000;

// Runs when executed directly (npm run seed:dev), not when setup-dev.mjs imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await waitForGateway();
  await seedDevEmployeeAccount();
  console.log('Dev test accounts are ready.');
}

export async function waitForGateway() {
  await withRetries('the API gateway to answer sign-in', async () => {
    await login(DEV_TEST_ACCOUNTS.hr.email, DEV_TEST_ACCOUNTS.hr.password, 'HR');
  });
}

export async function seedDevEmployeeAccount() {
  const accessToken = await login(DEV_TEST_ACCOUNTS.hr.email, DEV_TEST_ACCOUNTS.hr.password, 'HR');
  const positionId = await findMasterOptionId(
    accessToken,
    'positions',
    DEV_TEST_ACCOUNTS.employee.positionCode,
  );
  const employeeStatusId = await findMasterOptionId(accessToken, 'employee-statuses', 'ACTIVE');
  await createEmployee(accessToken, positionId, employeeStatusId);
  await login(DEV_TEST_ACCOUNTS.employee.email, DEV_TEST_ACCOUNTS.employee.password, 'EMPLOYEE');
}

async function login(email, password, portal) {
  const response = await request('POST', '/auth/login', { email, password, portal });
  if (!response.ok) {
    throw new Error(`Sign-in as ${email} failed with HTTP ${response.status}.`);
  }
  return (await response.json()).accessToken;
}

async function findMasterOptionId(accessToken, path, code) {
  return withRetries(`the ${code} master option`, async () => {
    const response = await request('GET', `/${path}`, undefined, accessToken);
    if (!response.ok) {
      throw new Error(`Listing ${path} failed with HTTP ${response.status}.`);
    }
    const options = await response.json();
    const option = options.find((candidate) => candidate.code === code);
    if (option === undefined) throw new Error(`The ${code} master option is not seeded yet.`);
    return option.id;
  });
}

async function createEmployee(accessToken, positionId, employeeStatusId) {
  const employee = DEV_TEST_ACCOUNTS.employee;
  await withRetries('the employee test account', async () => {
    const response = await request(
      'POST',
      '/employees',
      {
        operationId: employee.operationId,
        name: employee.name,
        email: employee.email,
        positionId,
        employeeStatusId,
        phoneNumber: null,
        role: 'EMPLOYEE',
        initialPassword: employee.password,
      },
      accessToken,
    );
    if (!response.ok) {
      throw new Error(`Creating the employee test account failed with HTTP ${response.status}.`);
    }
  });
}

async function request(method, path, body, accessToken) {
  const headers = { 'content-type': 'application/json' };
  if (accessToken !== undefined) headers.authorization = `Bearer ${accessToken}`;
  return fetch(`${GATEWAY_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
}

async function withRetries(what, attempt) {
  const deadline = Date.now() + SERVICE_WAIT_TIMEOUT_MILLISECONDS;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for ${what}. Check 'docker compose --profile apps logs' for a failing service.`,
          { cause: error },
        );
      }
      await delay(RETRY_DELAY_MILLISECONDS);
    }
  }
}
