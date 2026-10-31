import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginResponse } from '@dexa/contracts';
import { postLogin } from './post-login.js';
import { authQueryKeys } from './auth-query-keys.js';
import type { LoginFormValues } from './login-form.schema.js';
import { DisallowedRoleLoginError, getLoginErrorMessage } from './login-error-message.js';
import { useSession } from '../session-context.js';

type UseLoginOptions = {
  onSignedIn: (response: LoginResponse) => void;
};

/** Signs in through the portal of the surrounding SessionProvider. */
export function useLogin({ onSignedIn }: UseLoginOptions) {
  const { apiClient, portal, allowedRoles } = useSession();
  const queryClient = useQueryClient();
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginFormValues) => {
      const response = await postLogin(apiClient, portal, credentials);
      // Rejected before onSuccess, so the account is never cached and no session starts for it.
      if (!allowedRoles.includes(response.account.role)) throw new DisallowedRoleLoginError();
      return response;
    },
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
