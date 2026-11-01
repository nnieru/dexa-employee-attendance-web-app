import type { MasterOption } from '@dexa/contracts';

/**
 * Only active options can be newly assigned (contract masterOptionSchema). Inactive rows exist so that existing
 * profiles still resolve their names, so the create form does not offer them.
 */
export function selectActiveOptions(
  options: ReadonlyArray<MasterOption>,
): ReadonlyArray<MasterOption> {
  return options.filter((option) => option.isActive);
}
