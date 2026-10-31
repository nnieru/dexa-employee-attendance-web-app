import type { BusinessDate } from '@dexa/common';
import type {
  WorkScheduleOverview,
  WorkScheduleVersion,
  WorkScheduleVersionRequest,
} from '@dexa/contracts';
import type { NewWorkSchedule } from './work-schedule.repository.interface.js';

const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

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

/**
 * A version that has not taken effect yet (DATABASE §5.2). Only such a version can be edited, and a new version can
 * be created only when none exists.
 */
export function isUpcomingVersion(
  version: WorkScheduleVersion,
  businessDate: BusinessDate,
): boolean {
  return version.effectiveFrom > businessDate;
}

/** The business date after the given one. Calendar dates are compared as text, so only the date part is used. */
export function nextBusinessDate(businessDate: BusinessDate): BusinessDate {
  const midnightUtc = new Date(`${businessDate}T00:00:00Z`);
  return new Date(midnightUtc.getTime() + ONE_DAY_MILLISECONDS).toISOString().slice(0, 10);
}

/** A schedule change takes effect tomorrow or later, never on the business date itself (PRD SCH-4). */
export function isEffectiveFromAllowed(
  effectiveFrom: BusinessDate,
  businessDate: BusinessDate,
): boolean {
  return effectiveFrom >= nextBusinessDate(businessDate);
}

/**
 * The stored values of a version. The client sends only the schedule fields; the name and the timezone come from the
 * service, so this copies each field explicitly rather than spreading the request.
 */
export function buildWorkScheduleValues(input: {
  readonly request: WorkScheduleVersionRequest;
  readonly timezone: string;
  readonly name: string;
}): NewWorkSchedule {
  const { request } = input;
  return {
    name: input.name,
    timezone: input.timezone,
    workingWeekdays: request.workingWeekdays,
    startTime: request.startTime,
    endTime: request.endTime,
    lateCheckinGraceMinutes: request.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: request.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: request.lateCheckoutGraceMinutes,
    effectiveFrom: request.effectiveFrom,
  };
}
