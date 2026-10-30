import { z } from 'zod';
import type { BaseConfig } from '@dexa/common';
import { FIXTURE_MASTER_DATA } from './master-data-fixtures.js';

// The setting value that selects the labeled local-development fixtures instead of JSON.
const FIXTURES_SETTING = 'fixtures';
const SETTING_FIELD = 'EMPLOYEE_MASTER_DATA';
// Matches the code and name rules of the master tables (DATABASE §2).
const MASTER_CODE_PATTERN = /^[A-Z0-9_]+$/;
const MASTER_CODE_MAX_LENGTH = 50;
const MASTER_NAME_MAX_LENGTH = 150;
// Deactivation assigns INACTIVE and blocks access (DATABASE §4), so both codes must exist for it to work.
const REQUIRED_EMPLOYEE_STATUS_CODES = ['ACTIVE', 'INACTIVE'] as const;

const masterCodeSchema = z
  .string()
  .max(MASTER_CODE_MAX_LENGTH, { error: `must be at most ${MASTER_CODE_MAX_LENGTH} characters` })
  .regex(MASTER_CODE_PATTERN, {
    error: 'must use only uppercase letters, digits, and underscores',
  });

const masterNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'must not be blank' })
  .max(MASTER_NAME_MAX_LENGTH, { error: `must be at most ${MASTER_NAME_MAX_LENGTH} characters` });

const masterEntrySchema = z.strictObject({
  code: masterCodeSchema,
  name: masterNameSchema,
});

const masterEntriesSchema = z
  .array(masterEntrySchema)
  .superRefine((entries, context) => requireUniqueCodes(entries, context));

const masterDataDocumentSchema = z
  .strictObject({
    positions: masterEntriesSchema,
    employeeStatuses: masterEntriesSchema,
  })
  .superRefine((document, context) => requireStatusCodes(document.employeeStatuses, context));

export type MasterDataDocument = z.infer<typeof masterDataDocumentSchema>;

function requireUniqueCodes(
  entries: ReadonlyArray<{ readonly code: string }>,
  context: z.RefinementCtx,
): void {
  const seenCodes = new Set<string>();
  entries.forEach((entry, index) => {
    if (seenCodes.has(entry.code)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'code'],
        message: 'must be unique within its list',
      });
    }
    seenCodes.add(entry.code);
  });
}

function requireStatusCodes(
  employeeStatuses: ReadonlyArray<{ readonly code: string }>,
  context: z.RefinementCtx,
): void {
  const presentCodes = new Set(employeeStatuses.map((status) => status.code));
  for (const requiredCode of REQUIRED_EMPLOYEE_STATUS_CODES) {
    if (presentCodes.has(requiredCode)) continue;
    context.addIssue({
      code: 'custom',
      path: ['employeeStatuses'],
      message: `must include an entry with code ${requiredCode}`,
    });
  }
}

/**
 * Resolves EMPLOYEE_MASTER_DATA into the catalog to seed. Unset means no seeding. The literal
 * `fixtures` selects labeled local-development data and is refused in production. Anything else must
 * be the JSON document. Failure messages name the field only, never the value or the parser's text.
 */
export function resolveMasterDataSetting(
  nodeEnvironment: BaseConfig['NODE_ENV'],
  setting: string | undefined,
  context: z.RefinementCtx,
): MasterDataDocument | undefined {
  if (setting === undefined) return undefined;
  if (setting === FIXTURES_SETTING) return resolveFixtures(nodeEnvironment, context);
  return parseDocumentJson(setting, context);
}

function resolveFixtures(
  nodeEnvironment: BaseConfig['NODE_ENV'],
  context: z.RefinementCtx,
): MasterDataDocument | undefined {
  if (nodeEnvironment === 'production') {
    context.addIssue({
      code: 'custom',
      path: [SETTING_FIELD],
      message: 'fixtures must not be used when NODE_ENV is production',
    });
    return undefined;
  }
  return FIXTURE_MASTER_DATA;
}

function parseDocumentJson(
  setting: string,
  context: z.RefinementCtx,
): MasterDataDocument | undefined {
  let document: unknown;
  try {
    document = JSON.parse(setting);
  } catch {
    // The parser's message can quote part of the input, so it is dropped rather than reported.
    context.addIssue({
      code: 'custom',
      path: [SETTING_FIELD],
      message: 'must be fixtures or a JSON object with positions and employeeStatuses arrays',
    });
    return undefined;
  }
  const result = masterDataDocumentSchema.safeParse(document);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    context.addIssue({
      code: 'custom',
      path: [SETTING_FIELD, ...issue.path],
      message: issue.message,
    });
  }
  return undefined;
}
