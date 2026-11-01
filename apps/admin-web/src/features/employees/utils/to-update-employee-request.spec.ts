import { describe, expect, it } from 'vitest';
import type { EmployeeDetail } from '@dexa/contracts';
import {
  buildEmployeeDetail,
  UPDATE_STATUS_OPTIONS,
} from '../../../test/update-employee-fixtures.js';
import {
  INACTIVE_STATUS_ID,
  PRODUCT_ANALYST_POSITION_ID,
  RETIRED_POSITION_ID,
} from '../../../test/create-employee-fixtures.js';
import type { UpdateEmployeeFormValues } from '../types/update-employee-form.schema.js';
import {
  hasUpdateEmployeeChanges,
  isDeactivatingChange,
  toUpdateEmployeeChanges,
} from './to-update-employee-request.js';
import { toUpdateEmployeeFormValues } from './to-update-employee-form-values.js';

const STORED: EmployeeDetail = buildEmployeeDetail();
const UNCHANGED_VALUES: UpdateEmployeeFormValues = toUpdateEmployeeFormValues(STORED);

describe('toUpdateEmployeeChanges', () => {
  it.each([
    {
      caseName: 'no field differs from the stored employee',
      values: UNCHANGED_VALUES,
      shouldResendStatus: false,
      expected: {},
    },
    {
      caseName: 'the name differs after trimming',
      values: { ...UNCHANGED_VALUES, name: '  Dewi Lestari Putri  ' },
      shouldResendStatus: false,
      expected: { name: 'Dewi Lestari Putri' },
    },
    {
      caseName: 'the phone is cleared',
      values: { ...UNCHANGED_VALUES, phoneNumber: '   ' },
      shouldResendStatus: false,
      expected: { phoneNumber: null },
    },
    {
      caseName: 'the phone is unchanged even with surrounding spaces',
      values: { ...UNCHANGED_VALUES, phoneNumber: `  ${STORED.phoneNumber ?? ''}  ` },
      shouldResendStatus: false,
      expected: {},
    },
    {
      caseName: 'the position differs',
      values: { ...UNCHANGED_VALUES, positionId: RETIRED_POSITION_ID },
      shouldResendStatus: false,
      expected: { positionId: RETIRED_POSITION_ID },
    },
    {
      caseName: 'the status differs',
      values: { ...UNCHANGED_VALUES, employeeStatusId: INACTIVE_STATUS_ID },
      shouldResendStatus: false,
      expected: { employeeStatusId: INACTIVE_STATUS_ID },
    },
    {
      caseName: 'a password is entered',
      values: { ...UNCHANGED_VALUES, newPassword: 'new-password-2' },
      shouldResendStatus: false,
      expected: { newPassword: 'new-password-2' },
    },
    {
      caseName: 'a previous save did not finish, so the status is repeated',
      values: { ...UNCHANGED_VALUES, name: 'Dewi Lestari Putri' },
      shouldResendStatus: true,
      expected: { name: 'Dewi Lestari Putri', employeeStatusId: STORED.employeeStatus.id },
    },
  ])(
    'should name only the changed fields when $caseName',
    ({ values, shouldResendStatus, expected }) => {
      expect(toUpdateEmployeeChanges(values, STORED, shouldResendStatus)).toEqual(expected);
    },
  );

  it('should not name the position when the stored position is kept', () => {
    const changes = toUpdateEmployeeChanges(
      { ...UNCHANGED_VALUES, positionId: PRODUCT_ANALYST_POSITION_ID },
      STORED,
      false,
    );

    expect(changes).not.toHaveProperty('positionId');
  });
});

describe('hasUpdateEmployeeChanges', () => {
  it('should report no changes for an empty set and changes for any named field', () => {
    expect(hasUpdateEmployeeChanges({})).toBe(false);
    expect(hasUpdateEmployeeChanges({ name: 'Dewi' })).toBe(true);
  });
});

describe('isDeactivatingChange', () => {
  it.each([
    {
      caseName: 'the INACTIVE status is named',
      changes: { employeeStatusId: INACTIVE_STATUS_ID },
      expected: true,
    },
    {
      caseName: 'the ACTIVE status is named',
      changes: { employeeStatusId: STORED.employeeStatus.id },
      expected: false,
    },
    { caseName: 'no status is named', changes: { name: 'Dewi' }, expected: false },
  ])('should return $expected when $caseName', ({ changes, expected }) => {
    expect(isDeactivatingChange(changes, UPDATE_STATUS_OPTIONS)).toBe(expected);
  });
});
