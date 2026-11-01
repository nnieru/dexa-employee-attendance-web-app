// One key factory for the profile feature. Invalidating `profileQueryKeys.all` refreshes both the profile and
// the photo, which is what a photo change needs; a phone change invalidates only `ownProfile()`.
export const profileQueryKeys = {
  all: ['profile'] as const,
  ownProfile: () => ['profile', 'own'] as const,
  ownPhoto: (photoRequestPath: string | null) =>
    ['profile', 'own-photo', photoRequestPath] as const,
};
