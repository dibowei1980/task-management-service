import { useCallback, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  variant?: 'danger' | 'primary';
  confirmLabel?: string;
}

export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  const dialog = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      variant={state.variant ?? 'primary'}
      confirmLabel={state.confirmLabel ?? '确认'}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, dialog };
}