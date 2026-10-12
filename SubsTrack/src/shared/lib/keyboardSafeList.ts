// card taps work with the search keyboard up; dragging hides it — gotcha #191
export const KEYBOARD_SAFE_LIST = {
  keyboardShouldPersistTaps: "handled",
  keyboardDismissMode: "on-drag",
} as const;
