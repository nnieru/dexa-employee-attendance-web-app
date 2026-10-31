// One key factory for the profile feature. Invalidating `profileQueryKeys.all` refreshes both the profile and
// the photo, which is what a later photo or phone change needs.
export const profileQueryKeys = {
  all: ['profile'] as const,
  ownProfile: () => ['profile', 'own'] as const,
  ownPhoto: (photoRequestPath: string | null) =>
    ['profile', 'own-photo', photoRequestPath] as const,
};
