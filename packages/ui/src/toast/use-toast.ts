import { useContext } from 'react';
import { ToastContext, type ToastApi } from './toast-context.js';

export function useToast(): ToastApi {
  const toastApi = useContext(ToastContext);
  if (!toastApi) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return toastApi;
}
