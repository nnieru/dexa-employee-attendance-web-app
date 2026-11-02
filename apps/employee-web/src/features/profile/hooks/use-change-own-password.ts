import { useMutation } from '@tanstack/react-query';
import type { ChangePasswordRequest } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { changeOwnPassword } from '../api/change-own-password.js';

// The password is not part of the profile, so no profile query is refetched. The session stays signed in:
// existing access tokens stay valid after a password change.
export function useChangeOwnPassword() {
  const { apiClient } = useSession();
  return useMutation({
    mutationFn: (request: ChangePasswordRequest) => changeOwnPassword(apiClient, request),
  });
}
