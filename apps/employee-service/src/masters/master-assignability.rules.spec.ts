import {
  findUnassignableMasterField,
  type MasterReferenceOption,
} from './master-assignability.rules.js';

const ACTIVE = { isActive: true };
const INACTIVE = { isActive: false };

describe('findUnassignableMasterField', () => {
  it.each([
    {
      condition: 'both options are active',
      references: [
        { field: 'positionId', option: ACTIVE },
        { field: 'employeeStatusId', option: ACTIVE },
      ],
      expected: undefined,
    },
    {
      condition: 'the position is inactive',
      references: [
        { field: 'positionId', option: INACTIVE },
        { field: 'employeeStatusId', option: ACTIVE },
      ],
      expected: 'positionId',
    },
    {
      condition: 'the position does not exist',
      references: [
        { field: 'positionId', option: undefined },
        { field: 'employeeStatusId', option: ACTIVE },
      ],
      expected: 'positionId',
    },
    {
      condition: 'the employee status is inactive',
      references: [
        { field: 'positionId', option: ACTIVE },
        { field: 'employeeStatusId', option: INACTIVE },
      ],
      expected: 'employeeStatusId',
    },
    {
      condition: 'both options are inactive, so the position is named',
      references: [
        { field: 'positionId', option: INACTIVE },
        { field: 'employeeStatusId', option: INACTIVE },
      ],
      expected: 'positionId',
    },
    {
      condition: 'only the status is checked and it is active',
      references: [{ field: 'employeeStatusId', option: ACTIVE }],
      expected: undefined,
    },
    {
      condition: 'no reference is checked',
      references: [],
      expected: undefined,
    },
  ] satisfies ReadonlyArray<{
    condition: string;
    references: ReadonlyArray<MasterReferenceOption>;
    expected: string | undefined;
  }>)('should return $expected when $condition', ({ references, expected }) => {
    expect(findUnassignableMasterField(references)).toBe(expected);
  });
});
