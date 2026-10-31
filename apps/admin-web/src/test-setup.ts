import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './test/msw-server.js';

// jsdom does not implement scrolling; the router scrolls to the top on every navigation, which would
// print "Not implemented" for each one. Scrolling has no effect on what these tests assert.
window.scrollTo = () => undefined;

// An unmocked request fails the test instead of reaching a real server.
beforeAll(() => {
  mswServer.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});
