import {
  findUnassignableMasterField,
  type MasterReferenceOption,
} from './master-assignability.rules.js';
import { masterNotAssignableError } from './master-assignment.errors.js';
import {
  type IMasterAssignmentReader,
  type MasterAssignmentField,
} from './master-assignment.reader.interface.js';

/** A reference that a write is about to assign. Only the references that change are passed in. */
export type MasterReferenceToAssign = {
  readonly field: MasterAssignmentField;
  readonly optionId: string;
};

/**
 * Rejects with a 400 that names the field when a reference is about to name an option that cannot be newly assigned.
 * The rule covers new assignments only (DATABASE §4), so callers pass the references that change, not the stored ones.
 */
export async function assertMastersAssignable(
  reader: IMasterAssignmentReader,
  references: ReadonlyArray<MasterReferenceToAssign>,
): Promise<void> {
  const options = await Promise.all(references.map((reference) => readOption(reader, reference)));
  const field = findUnassignableMasterField(options);
  if (field !== undefined) throw masterNotAssignableError(field);
}

async function readOption(
  reader: IMasterAssignmentReader,
  reference: MasterReferenceToAssign,
): Promise<MasterReferenceOption> {
  const option =
    reference.field === 'positionId'
      ? await reader.findPositionOption(reference.optionId)
      : await reader.findEmployeeStatusOption(reference.optionId);
  return { field: reference.field, option };
}
