import { useConfirmStore, type ConfirmOptions } from './confirmStore';

export const confirm = (options: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().show(options);
