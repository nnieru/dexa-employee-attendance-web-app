// One overview holds the version in effect and the upcoming version, so one key covers the whole screen.
export const scheduleQueryKeys = {
  all: ['schedule'] as const,
  overview: () => [...scheduleQueryKeys.all, 'overview'] as const,
};
