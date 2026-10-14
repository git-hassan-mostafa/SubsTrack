import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";
import { confirm } from "@shared/shared/lib/confirm";
import { useConfirmStore } from "@shared/shared/lib/confirmStore";

// Prompts discard confirmation when route navigation occurs while active.
export function useNavigationBlocker(active: boolean, onDiscard?: () => void) {
  const { t } = useTranslation();
  const blocker = useBlocker(active);
  const askingRef = useRef(false);
  const deadRef = useRef(false);

  useEffect(() => {
    deadRef.current = false;
    return () => {
      deadRef.current = true;
      if (askingRef.current) useConfirmStore.getState().settle(false);
    };
  }, []);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (askingRef.current || deadRef.current) return;
    askingRef.current = true;
    void (async () => {
      const discard = await confirm({
        title: t("common.discard_changes_title"),
        message: t("common.discard_changes_message"),
        confirmLabel: t("common.discard"),
        cancelLabel: t("common.keep_editing"),
        destructive: true,
      });
      askingRef.current = false;
      if (deadRef.current) return;
      if (blocker.state !== "blocked") return;
      if (discard) {
        onDiscard?.();
        blocker.proceed();
      } else {
        blocker.reset();
      }
    })();
  }, [blocker, onDiscard, t]);
}
