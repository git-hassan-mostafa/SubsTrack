import type { Ref } from "react";
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router";

type LinkBehaviorProps = Omit<RouterLinkProps, "to"> & {
  href: RouterLinkProps["to"];
  ref?: Ref<HTMLAnchorElement>;
};

// Lets every MUI Link / Button `href` navigate inside the app, not reload it.
export function LinkBehavior({ href, ref, ...other }: LinkBehaviorProps) {
  return <RouterLink ref={ref} to={href} {...other} />;
}
