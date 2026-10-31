export type AccessTokenStore = {
  get: () => string | null;
  set: (accessToken: string | null) => void;
};

// Holds the access token in memory only. The HTTP client reads it outside React's render cycle, so it
// lives in a store object rather than React state. Nothing here is persisted.
export function createAccessTokenStore(): AccessTokenStore {
  let accessToken: string | null = null;
  return {
    get: () => accessToken,
    set: (nextAccessToken) => {
      accessToken = nextAccessToken;
    },
  };
}
