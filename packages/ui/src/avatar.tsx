import { useState } from 'react';

type AvatarSize = 'small' | 'medium' | 'large';

/** A photo must come with alt text. Without a photo, the name drives the initials fallback. */
type AvatarPhoto = { photoUrl: string; photoAlt: string } | { photoUrl?: null; photoAlt?: never };

export type AvatarProps = {
  name: string;
  size?: AvatarSize;
} & AvatarPhoto;

/** Gives the initials at most two letters: the first letter of the first and last words. */
function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const firstLetters = words.map((word) => Array.from(word)[0]);
  const initialLetters =
    firstLetters.length > 1
      ? [firstLetters[0], firstLetters[firstLetters.length - 1]]
      : firstLetters;
  return initialLetters.join('').toUpperCase();
}

/**
 * A round photo with alt text, or initials when there is no photo or the photo fails to load. The
 * initials element is an image with the name as its accessible name, so the fallback is not silent.
 */
export function Avatar({ name, photoAlt, photoUrl, size = 'medium' }: AvatarProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const sizeClassName = `dexa-avatar--${size}`;

  if (photoUrl && failedPhotoUrl !== photoUrl) {
    return (
      <img
        className={`dexa-avatar dexa-avatar--photo ${sizeClassName}`}
        src={photoUrl}
        alt={photoAlt}
        onError={() => setFailedPhotoUrl(photoUrl)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={`dexa-avatar dexa-avatar--initials ${sizeClassName}`}
    >
      {getInitials(name)}
    </span>
  );
}
