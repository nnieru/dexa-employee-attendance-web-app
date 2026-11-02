// The local test accounts that `npm run setup` seeds and the README documents. Local development
// only: the values are public by design, the generated .env is git-ignored, and they must never
// reach a deployed environment.

export const DEV_TEST_ACCOUNTS = {
  broker: {
    // The RabbitMQ management account that `npm run setup` creates; `dexa` also owns and declares
    // every queue and exchange the topology code needs.
    username: 'dexa',
    password: 'RabbitDev123',
  },
  hr: {
    email: 'hr.admin@dexa.test',
    password: 'HrAdmin123',
    name: 'Sari Lestari',
    positionCode: 'HR_OFFICER',
  },
  employee: {
    email: 'employee1@dexa.test',
    password: 'Employee123',
    name: 'Budi Santoso',
    positionCode: 'FULLSTACK_DEVELOPER',
    // A fixed operation ID makes the seed a replay of the same provisioning operation, so repeated
    // setups return the stored employee instead of colliding on the email (DATABASE §4.3).
    operationId: '00000000-0000-4000-8000-000000000001',
  },
};
