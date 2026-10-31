import type { BusinessDate } from '@dexa/common';
import type { WorkScheduleOverview, WorkScheduleVersion } from '@dexa/contracts';

/**
 * Picks the version in effect on the business date and the nearest version after it. Versions must be ordered by
 * effective date, earliest first, so the first match is the nearest one. Business dates are YYYY-MM-DD, so string
 * order is calendar order.
 */
export function selectWorkScheduleOverview(
  versions: ReadonlyArray<WorkScheduleVersion>,
  businessDate: BusinessDate,
): WorkScheduleOverview {
  return {
    current: versions.find((version) => isInEffectOn(version, businessDate)) ?? null,
    upcoming: versions.find((version) => version.effectiveFrom > businessDate) ?? null,
  };
}

// effective_from is inclusive and effective_until is exclusive (DATABASE §5.2).
function isInEffectOn(version: WorkScheduleVersion, businessDate: BusinessDate): boolean {
  if (version.effectiveFrom > businessDate) return false;
  return version.effectiveUntil === null || businessDate < version.effectiveUntil;
}
