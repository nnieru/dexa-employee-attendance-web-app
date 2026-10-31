import { ProfileStatus, Role } from '@dexa/contracts';
import { describe, expect, it } from 'vitest';
import {
  getEmploymentStatusPresentation,
  getProfileStatusPresentation,
  getRoleLabel,
} from './employee-status-presentation.js';

describe('getEmploymentStatusPresentation', () => {
  it.each([
    ['ACTIVE', 'Active', 'success'],
    ['INACTIVE', 'Inactive', 'neutral'],
  ])('should label the %s status as %s with the %s tone', (code, name, tone) => {
    expect(getEmploymentStatusPresentation({ code, name })).toEqual({ label: name, tone });
  });
});

describe('getProfileStatusPresentation', () => {
  it('should show Complete with the success tone when the profile is complete', () => {
    expect(getProfileStatusPresentation(ProfileStatus.COMPLETE)).toEqual({
      label: 'Complete',
      tone: 'success',
    });
  });

  it('should show Incomplete with the warning tone when the profile is incomplete', () => {
    expect(getProfileStatusPresentation(ProfileStatus.INCOMPLETE)).toEqual({
      label: 'Incomplete',
      tone: 'warning',
    });
  });
});

describe('getRoleLabel', () => {
  it.each([
    [Role.EMPLOYEE, 'Employee'],
    [Role.HR, 'HR'],
  ])('should label role %s as %s', (role, label) => {
    expect(getRoleLabel(role)).toBe(label);
  });
});
