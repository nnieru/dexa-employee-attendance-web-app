const UTC_OFFSET_PATTERN = /^[+-]/;

/**
 * Intl also accepts fixed UTC offsets such as "+07:00", which carry no tzdata rules. The business
 * timezone must name a zone so that rule changes are picked up, so offsets are rejected explicitly.
 */
export function isIanaTimeZone(timeZone: string): boolean {
  if (UTC_OFFSET_PATTERN.test(timeZone)) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
