// @ts-nocheck — Deno runtime file.

// Also cancels what is still queued for the number, so a STOP holds at once.
export async function recordOptOut(
  service,
  args: {
    tenantId: string;
    phone: string;
    customerId: string | null;
    source: "stop_reply" | "admin";
    createdBy?: string | null;
  },
) {
  const { error } = await service.from("whatsapp_opt_outs").insert({
    tenant_id: args.tenantId,
    phone_e164: args.phone,
    customer_id: args.customerId,
    source: args.source,
    created_by: args.createdBy ?? null,
  });
  if (error && error.code !== "23505") throw error;
  const { error: cancelError } = await service
    .from("whatsapp_messages")
    .update({ status: "cancelled", error_key: "opted_out", variables: null })
    .eq("tenant_id", args.tenantId)
    .eq("to_phone_e164", args.phone)
    .eq("status", "queued");
  if (cancelError) throw cancelError;
}

// A STOP from a number the customer no longer has stays, only unlinked.
export async function clearOptOut(
  service,
  args: { tenantId: string; customerId: string; phone: string; clearedBy: string },
) {
  const { error } = await service
    .from("whatsapp_opt_outs")
    .update({ cleared_at: new Date().toISOString(), cleared_by: args.clearedBy })
    .eq("tenant_id", args.tenantId)
    .is("cleared_at", null)
    .or(`phone_e164.eq.${args.phone},and(customer_id.eq.${args.customerId},source.eq.admin)`);
  if (error) throw error;
  const { error: unlinkError } = await service
    .from("whatsapp_opt_outs")
    .update({ customer_id: null })
    .eq("tenant_id", args.tenantId)
    .eq("customer_id", args.customerId)
    .is("cleared_at", null);
  if (unlinkError) throw unlinkError;
}
