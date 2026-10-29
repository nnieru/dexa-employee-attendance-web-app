/** Source of the server instant. Attendance timestamps must come from here, never from client input. */
export interface IClock {
  now(): Date;
}

export const CLOCK = Symbol('IClock');
