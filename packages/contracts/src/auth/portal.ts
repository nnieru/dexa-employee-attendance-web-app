// The employee portal accepts EMPLOYEE and HR accounts, and the HR portal accepts HR accounts only
// The auth-service login rule applies these portals; this file only names them.
export const Portal = {
  EMPLOYEE: 'EMPLOYEE',
  HR: 'HR',
} as const;

export type Portal = (typeof Portal)[keyof typeof Portal];
