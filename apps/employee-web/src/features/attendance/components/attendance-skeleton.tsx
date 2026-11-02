// The rows the loaded panel will show, so the skeleton keeps the same shape. Keys are names, not indexes.
const SKELETON_ROW_NAMES = ['schedule', 'clock-in', 'clock-out'] as const;

// No placeholder times or statuses: the skeleton only reserves the space.
export function AttendanceSkeleton() {
  return (
    <div aria-busy="true">
      <p className="employee-attendance-skeleton__status" role="status">
        Loading attendance…
      </p>
      <div className="employee-attendance-panel" aria-hidden="true">
        <span className="employee-attendance-skeleton__block employee-attendance-skeleton__line" />
        {SKELETON_ROW_NAMES.map((rowName) => (
          <span
            key={rowName}
            className="employee-attendance-skeleton__block employee-attendance-skeleton__row"
          />
        ))}
        <span className="employee-attendance-skeleton__block employee-attendance-skeleton__action" />
      </div>
    </div>
  );
}
