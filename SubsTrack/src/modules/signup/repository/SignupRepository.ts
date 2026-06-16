import { supabase } from "@/src/shared/lib/supabase";
import { readFunctionsErrorBody } from "@/src/core/utils/functionsError";
import { CreateTenantInput, CreateTenantResult } from "../utils/types";

class SignupRepository {
  async isTenantCodeAvailable(code: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("is_tenant_code_available", {
      code: code.trim().toLowerCase(),
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
    const { data, error } = await supabase.functions.invoke<
      CreateTenantResult & { error?: string; code?: string }
    >("create-tenant", { body: input });

    if (error) {
      // supabase-js wraps non-2xx into a FunctionsHttpError whose context.response
      // holds the parsed JSON body; surface the server-provided code when present.
      const parsed = await readFunctionsErrorBody(error);
      const serverMessage = parsed?.error ?? error.message;
      const wrapped: Error & { code?: string } = new Error(serverMessage);
      if (parsed?.code) wrapped.code = parsed.code;
      throw wrapped;
    }
    if (!data || !data.tenantId) {
      throw new Error("Signup failed: unexpected response");
    }
    return { tenantId: data.tenantId, tenantCode: data.tenantCode };
  }
}

export default new SignupRepository()
