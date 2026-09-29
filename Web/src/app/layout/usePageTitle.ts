import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";

export interface PageHandle {
  titleKey: string;
}

function isPageHandle(handle: unknown): handle is PageHandle {
  return typeof (handle as PageHandle | undefined)?.titleKey === "string";
}

// The deepest matched route names the page; the browser tab follows it too.
export function usePageTitle(): string {
  const { t } = useTranslation();
  const handle = useMatches()
    .map((match) => match.handle)
    .findLast(isPageHandle);
  const title = handle ? t(handle.titleKey) : "";
  const appName = t("auth.title");

  useEffect(() => {
    document.title = title ? `${title} · ${appName}` : appName;
  }, [title, appName]);

  return title;
}
