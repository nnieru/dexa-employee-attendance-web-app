import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginResponse } from '@dexa/contracts';
import { postEmployeeLogin } from '../api/post-employee-login.js';
import { authQueryKeys } from '../api/auth-query-keys.js';
import type { ApiClient } from '../types/api-client.js';
import type { LoginFormValues } from '../types/login-form.schema.js';
import { getLoginErrorMessage } from '../utils/login-error-message.js';

type UseEmployeeLoginOptions = {
  apiClient: ApiClient;
  onSignedIn: (response: LoginResponse) => void;
};

export function useEmployeeLogin({ apiClient, onSignedIn }: UseEmployeeLoginOptions) {
  const queryClient = useQueryClient();
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginFormValues) => postEmployeeLogin(apiClient, credentials),
    onSuccess: (response) => {
      // The login response already carries the account, so the session check does not start empty.
      queryClient.setQueryData(authQueryKeys.currentAccount, response.account);
      onSignedIn(response);
    },
  });

  function submitLogin(credentials: LoginFormValues): void {
    // A second submit while a request is in flight would send a second login (double submit).
    if (loginMutation.isPending) return;
    loginMutation.mutate(credentials);
  }

  return {
    submitLogin,
    isBusy: loginMutation.isPending,
    errorMessage: loginMutation.error ? getLoginErrorMessage(loginMutation.error) : null,
  };
}
