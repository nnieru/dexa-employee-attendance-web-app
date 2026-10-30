// Postgres LIKE treats a backslash as its escape character, so each special character gets one in front of it.
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

/**
 * The LIKE pattern for a case-insensitive substring match on a name. The term matches literally: `%` and `_`
 * lose their wildcard meaning. The pattern is still bound as a parameter, never spliced into SQL text.
 */
export function toNameContainsPattern(term: string): string {
  return `%${term.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`)}%`;
}
