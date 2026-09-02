// supabase-js collapses any non-2xx edge-function response into a generic
// FunctionsHttpError whose `.message` is "Edge Function returned a non-2xx
// status code" — the real, user-facing message the function sent lives in the
// JSON body of the Response it carries. That Response is `error.context`
// itself in functions-js v2, and `error.context.response` in older builds, so
// accept both or every edge-function error loses its message (gotcha #40).
function errorResponse(err: unknown): Response | null {
  const context = (err as { context?: unknown })?.context;
  if (!context) return null;
  const nested = (context as { response?: unknown }).response;
  const candidate = nested ?? context;
  return typeof (candidate as Response)?.clone === 'function'
    ? (candidate as Response)
    : null;
}

export async function readFunctionsErrorBody(
  err: unknown,
): Promise<{ error?: string; code?: string } | null> {
  const response = errorResponse(err);
  if (!response) return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
