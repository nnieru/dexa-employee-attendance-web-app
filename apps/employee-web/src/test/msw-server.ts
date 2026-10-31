import { setupServer } from 'msw/node';

// Shared request mock. Each test adds its own handlers; test-setup resets them after every test.
export const mswServer = setupServer();
