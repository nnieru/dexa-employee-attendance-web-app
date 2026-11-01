import type { MasterOption } from '@dexa/contracts';

/**
 * Options a select may offer. Only active options can be newly assigned (contract masterOptionSchema). An inactive
 * option that the employee already holds is kept, so the stored value still shows in the select (DATABASE §4).
 */
export function selectAssignableOptions(
  options: ReadonlyArray<MasterOption>,
  currentOptionId: string | undefined,
): ReadonlyArray<MasterOption> {
  return options.filter((option) => option.isActive || option.id === currentOptionId);
}
