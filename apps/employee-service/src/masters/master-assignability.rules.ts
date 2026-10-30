import type { MasterAssignmentField } from './master-assignment.reader.interface.js';

/** A reference field and the option it names. Undefined when no such option exists. */
export type MasterReferenceOption = {
  readonly field: MasterAssignmentField;
  readonly option: { readonly isActive: boolean } | undefined;
};

/**
 * Names the first reference that cannot be newly assigned: one whose option is missing or inactive. The order of the
 * references decides the field that is named, so the position comes first.
 */
export function findUnassignableMasterField(
  references: ReadonlyArray<MasterReferenceOption>,
): MasterAssignmentField | undefined {
  return references.find((reference) => reference.option?.isActive !== true)?.field;
}
