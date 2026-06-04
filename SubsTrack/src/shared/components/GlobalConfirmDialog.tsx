import { useConfirmSlice } from "@/src/state/hooks/useConfirmSlice";
import { ConfirmDialog } from "./ConfirmDialog";

export default function GlobalConfirmDialog() {
  const visible = useConfirmSlice((s) => s.visible);
  const options = useConfirmSlice((s) => s.options);
  const settle = useConfirmSlice((s) => s.settle);

  if (!options) return null;

  return (
    <ConfirmDialog
      visible={visible}
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      destructive={options.destructive}
      hideCancel={options.hideCancel}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );
}
