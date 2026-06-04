import { getStore } from '@/src/state/globalStore';
import type { ConfirmOptions } from '@/src/state/slices/confirm/confirmSlice';

export const confirm = (options: ConfirmOptions): Promise<boolean> =>
  getStore().getState().confirm.show(options);
