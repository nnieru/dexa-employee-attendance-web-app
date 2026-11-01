import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateOwnProfileRequest } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { profileQueryKeys } from '../api/profile-query-keys.js';
import { updateOwnPhone } from '../api/update-own-phone.js';

// Only the profile changes with a phone update, so the photo bytes are not refetched. The profile is
// refetched before the mutation settles, so the success message appears with the stored data.
export function useUpdateOwnPhone() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateOwnProfileRequest) => updateOwnPhone(apiClient, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKeys.ownProfile() }),
  });
}
