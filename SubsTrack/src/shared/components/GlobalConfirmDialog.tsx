import { useConfirmStore } from "@/src/shared/lib/confirmStore";
import { ConfirmDialog } from "./ConfirmDialog";

export default function GlobalConfirmDialog() {
  const visible = useConfirmStore((s) => s.visible);
  const options = useConfirmStore((s) => s.options);
  const settle = useConfirmStore((s) => s.settle);
  const getContent = useConfirmStore((s) => s.getContent);
  const getOnConfirm = useConfirmStore((s) => s.getOnConfirm);

  if (!options) return null;

  const content = getContent();
  const work = getOnConfirm();

  // Held open while the caller's work runs, so the button can spin on it.
  async function runThenClose(run: () => Promise<void>) {
    try {
      await run();
    } finally {
      settle(true);
    }
  }

  return (
    <ConfirmDialog
      visible={visible}
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      destructive={options.destructive}
      hideCancel={options.hideCancel}
      onConfirm={work ? () => runThenClose(work) : () => settle(true)}
      onCancel={() => settle(false)}
    >
      {content ? content() : null}
    </ConfirmDialog>
  );
}
