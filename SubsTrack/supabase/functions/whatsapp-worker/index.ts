// @ts-nocheck — Deno runtime file.
import { serviceClient } from "../_shared/whatsapp/auth.ts";
import { timingSafeEqual } from "../_shared/whatsapp/crypto.ts";
import { createLogger, HttpError, newRequestId, requireEnv } from "../_shared/whatsapp/http.ts";
import { processQueue } from "../_shared/whatsapp/queue.ts";

const { log, json, handle } = createLogger("whatsapp-worker");

Deno.serve(async (req) => {
  const reqId = newRequestId();
  try {
    const { WHATSAPP_WORKER_SECRET } = requireEnv(["WHATSAPP_WORKER_SECRET"]);
    const provided = req.headers.get("x-worker-secret") ?? "";
    if (!timingSafeEqual(provided, WHATSAPP_WORKER_SECRET)) {
      throw new HttpError(401, "unauthorized", "Unauthorized");
    }
    const processed = await processQueue(serviceClient(), {
      budgetMs: 50_000,
      log: (event, detail) => log(reqId, event, detail),
    });
    return json({ processed });
  } catch (error) {
    return handle(reqId, error);
  }
});
