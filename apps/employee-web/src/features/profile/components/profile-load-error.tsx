import { Alert, Button } from '@dexa/ui';

type ProfileLoadErrorProps = {
  isRetrying: boolean;
  onRetry: () => void;
};

export function ProfileLoadError({ isRetrying, onRetry }: ProfileLoadErrorProps) {
  return (
    <Alert
      variant="error"
      action={
        <Button variant="secondary" isLoading={isRetrying} onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Your profile could not be loaded.
    </Alert>
  );
}
