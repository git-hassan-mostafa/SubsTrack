import { useConfirmStore } from "@/src/shared/lib/confirmStore";
import { ConfirmDialog } from "./ConfirmDialog";

export default function GlobalConfirmDialog() {
  const visible = useConfirmStore((s) => s.visible);
  const options = useConfirmStore((s) => s.options);
  const settle = useConfirmStore((s) => s.settle);
  const getContent = useConfirmStore((s) => s.getContent);

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
