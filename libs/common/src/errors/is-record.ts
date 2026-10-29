/** Narrows an unknown value to an object whose properties can be read without a cast. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
