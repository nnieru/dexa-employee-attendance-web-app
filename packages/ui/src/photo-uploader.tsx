import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Icon } from './icon.js';
import {
  checkPhotoFile,
  formatByteLimit,
  PHOTO_ACCEPT_ATTRIBUTE,
  type PhotoRejection,
} from './photo-file.js';

export type PhotoUploaderProps = {
  /** Visible text of the control and its accessible name, for example "Choose photo". */
  label: string;
  /** Largest accepted file in bytes. The server enforces the limit; this check only gives early feedback. */
  maxBytes: number;
  /** Receives the chosen file after it passes the client checks. The app decides when to upload it. */
  onSelect: (file: File) => void;
  /** Photo already on the profile, shown until a new valid file is chosen. */
  currentPhotoUrl?: string | null;
  /** Error from the app, for example a refused upload. A client-side rejection is shown in its place. */
  error?: ReactNode;
  isDisabled?: boolean;
};

type Selection = { file: File; previewUrl: string };

const REJECTION_MESSAGES: Record<PhotoRejection, (limitLabel: string) => string> = {
  'wrong-type': () => 'Choose a JPG or PNG image.',
  'too-large': (limitLabel) => `The photo is larger than ${limitLabel}. Choose a smaller file.`,
  'not-an-image': () => 'This file is not a JPG or PNG image. Choose another file.',
  unreadable: () => 'This file could not be read. Choose another file.',
};

/**
 * A visibly styled label wraps a real file input, so keyboard and screen-reader users operate the
 * native control. Each choice is checked before onSelect; a rejected choice keeps the last accepted
 * photo on screen and shows the reason.
 */
export function PhotoUploader({
  currentPhotoUrl = null,
  error,
  isDisabled = false,
  label,
  maxBytes,
  onSelect,
}: PhotoUploaderProps) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const limitLabel = formatByteLimit(maxBytes);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const latestCheckIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (selection) {
        URL.revokeObjectURL(selection.previewUrl);
      }
    };
  }, [selection]);

  useEffect(() => {
    // Unmounting cancels any check still reading a file, so onSelect never runs after unmount.
    return () => {
      latestCheckIdRef.current += 1;
    };
  }, []);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const chosenFile = event.currentTarget.files?.[0];
    // Clearing the input lets the same file be chosen again after it was rejected.
    event.currentTarget.value = '';
    if (!chosenFile) {
      return;
    }

    const checkId = latestCheckIdRef.current + 1;
    latestCheckIdRef.current = checkId;
    const result = await checkPhotoFile(chosenFile, maxBytes);
    if (latestCheckIdRef.current !== checkId) {
      return;
    }
    if (result.status === 'rejected') {
      setClientError(REJECTION_MESSAGES[result.rejection](limitLabel));
      return;
    }

    setClientError(null);
    setSelection({ file: chosenFile, previewUrl: URL.createObjectURL(chosenFile) });
    onSelect(chosenFile);
  }

  const previewUrl = selection?.previewUrl ?? currentPhotoUrl;
  const previewAlt = selection ? 'Preview of the selected photo' : 'Current photo';
  const visibleError = clientError || error || undefined;
  const describedBy = [hintId, visibleError ? errorId : undefined].filter(Boolean).join(' ');
  const controlClassName = isDisabled
    ? 'dexa-photo-uploader__control dexa-photo-uploader__control--disabled'
    : 'dexa-photo-uploader__control';

  return (
    <div className="dexa-photo-uploader">
      {previewUrl && (
        <img className="dexa-photo-uploader__preview" src={previewUrl} alt={previewAlt} />
      )}
      <label className={controlClassName}>
        <input
          type="file"
          accept={PHOTO_ACCEPT_ATTRIBUTE}
          className="dexa-photo-uploader__input"
          disabled={isDisabled}
          onChange={handleChange}
          aria-invalid={visibleError ? true : undefined}
          aria-describedby={describedBy}
        />
        <Icon name="upload" />
        <span>{label}</span>
      </label>
      <p id={hintId} className="dexa-field__hint">
        JPG or PNG, up to {limitLabel}.
      </p>
      {visibleError && (
        <p id={errorId} className="dexa-field__error" role={clientError ? 'alert' : undefined}>
          {visibleError}
        </p>
      )}
    </div>
  );
}
