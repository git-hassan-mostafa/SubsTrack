// supabase-js collapses any non-2xx edge-function response into a generic
// FunctionsHttpError whose `.message` is "Edge Function returned a non-2xx
// status code" — the real, user-facing message the function sent lives in the
// JSON body on `error.context.response` (a Response object). This shape is not
// in the public types, so read it defensively.
export async function readFunctionsErrorBody(
  err: unknown,
): Promise<{ error?: string; code?: string } | null> {
  const response = (err as { context?: { response?: Response } })?.context
    ?.response;
  if (!response) return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
