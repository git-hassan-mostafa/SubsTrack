import { useConfirmSlice } from "@/src/state/hooks/useConfirmSlice";
import { ConfirmDialog } from "./ConfirmDialog";

export default function GlobalConfirmDialog() {
  const visible = useConfirmSlice((s) => s.visible);
  const options = useConfirmSlice((s) => s.options);
  const settle = useConfirmSlice((s) => s.settle);
  const getContent = useConfirmSlice((s) => s.getContent);

  if (!options) return null;

  // Extra content (e.g. a checkbox) lives outside immer state — read it here.
  const content = getContent();

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
    >
      {content ? content() : null}
    </ConfirmDialog>
  );
}
