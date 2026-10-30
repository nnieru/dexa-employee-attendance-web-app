export const MASTER_ASSIGNMENT_READER = Symbol('IMasterAssignmentReader');

/** The reference fields of an employee profile that must name an active master option to be newly assigned. */
export type MasterAssignmentField = 'positionId' | 'employeeStatusId';

/** Whether HR may newly assign a position. Undefined when no such row exists. */
export type MasterPositionOption = { readonly isActive: boolean } | undefined;

/** The code decides what the status means, such as INACTIVE, and isActive decides whether it may be newly assigned. */
export type MasterEmployeeStatusOption =
  { readonly code: string; readonly isActive: boolean } | undefined;

/**
 * Reads the master options that a profile names (DATABASE §4). The answer is the row's current state, so a caller that
 * acts on it must still rely on the database rule when it writes (see the master-assignment trigger).
 */
export interface IMasterAssignmentReader {
  findPositionOption(positionId: string): Promise<MasterPositionOption>;
  findEmployeeStatusOption(employeeStatusId: string): Promise<MasterEmployeeStatusOption>;
}
