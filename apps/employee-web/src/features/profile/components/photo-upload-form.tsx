import { MAX_PHOTO_BYTES } from '@dexa/contracts';
import { Alert, PhotoUploader } from '@dexa/ui';
import { useReplaceOwnPhoto } from '../hooks/use-replace-own-photo.js';
import { getProfileErrorMessage } from '../utils/get-profile-error-message.js';

// The uploader checks type and size on the client and only then calls onSelect, so a rejected file
// never reaches the request. The server still decides for the bytes it receives.
export function PhotoUploadForm() {
  const photoMutation = useReplaceOwnPhoto();

  function submitPhoto(photo: File) {
    if (photoMutation.isPending) return;
    photoMutation.mutate(photo);
  }

  return (
    <div className="employee-profile-form">
      <PhotoUploader
        label="Choose photo"
        maxBytes={MAX_PHOTO_BYTES}
        isDisabled={photoMutation.isPending}
        error={photoMutation.error ? getProfileErrorMessage(photoMutation.error) : undefined}
        onSelect={submitPhoto}
      />
      {photoMutation.isSuccess && <Alert variant="success">Photo updated.</Alert>}
    </div>
  );
}
