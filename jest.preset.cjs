// Shared Jest preset for Nest apps and backend libs. Nest packages are ESM-only, so tests run as
// native ESM (node --experimental-vm-modules) through SWC. Workspace imports resolve to source so
// unit tests need no build step.
const path = require('node:path');

const workspaceSources = {
  '@dexa/contracts': 'packages/contracts/src/index.ts',
  '@dexa/common': 'libs/common/src/index.ts',
  '@dexa/db': 'libs/db/src/index.ts',
  '@dexa/messaging': 'libs/messaging/src/index.ts',
};

module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2023',
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
        module: { type: 'es6' },
      },
    ],
  },
  moduleNameMapper: {
    ...Object.fromEntries(
      Object.entries(workspaceSources).map(([name, file]) => [
        `^${name}$`,
        path.join(__dirname, file),
      ]),
    ),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/{src,test}/**/*.spec.ts'],
};
