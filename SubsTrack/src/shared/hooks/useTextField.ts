import { useState } from "react";
import { queueEcho, resolveEcho } from "@/src/core/utils/textEcho";

interface TextFieldOptions {
  sanitize?: (next: string) => string;
  expectedEcho?: (next: string) => string;
}

interface TextFieldBinding {
  value: string;
  onChangeText: (next: string) => void;
}

const NO_PENDING: readonly string[] = [];

/** The field owns its text — a late `value` prop must never overwrite it. */
export function useTextField(
  value: string,
  onChangeText?: (next: string) => void,
  options?: TextFieldOptions,
): TextFieldBinding {
  const [text, setText] = useState(value);
  const [ownerValue, setOwnerValue] = useState(value);
  const [pending, setPending] = useState(NO_PENDING);

  if (value !== ownerValue) {
    const echo = resolveEcho(value, pending);
    setOwnerValue(value);
    setPending(echo.pending);
    if (echo.adopt) setText(value);
  }

  function handleChangeText(raw: string) {
    const next = options?.sanitize ? options.sanitize(raw) : raw;
    setText(next);
    setPending((queue) =>
      queueEcho(queue, options?.expectedEcho?.(next) ?? next),
    );
    onChangeText?.(next);
  }

  return { value: text, onChangeText: handleChangeText };
}
