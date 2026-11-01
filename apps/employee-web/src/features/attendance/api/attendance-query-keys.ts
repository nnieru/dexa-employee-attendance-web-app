// One key factory for the attendance feature. Both punches invalidate `today()`, so the panel always shows the
// state the server holds after the attempt, whatever the outcome.
export const attendanceQueryKeys = {
  today: () => ['attendance', 'today'] as const,
};
