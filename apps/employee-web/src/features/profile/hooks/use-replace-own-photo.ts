import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@dexa/session';
import { profileQueryKeys } from '../api/profile-query-keys.js';
import { replaceOwnPhoto } from '../api/replace-own-photo.js';

// The photo URL stays the same after an upload, so the photo query is invalidated with the profile. That
// refetches the bytes, and the object URL is rebuilt from the new blob.
export function useReplaceOwnPhoto() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: File) => replaceOwnPhoto(apiClient, photo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKeys.all }),
  });
}
