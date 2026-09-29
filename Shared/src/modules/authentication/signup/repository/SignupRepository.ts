import { BaseRepository } from "@shared/core/utils/BaseRepository";
import { readFunctionsErrorBody } from "@shared/core/utils/functionsError";
import { CreateTenantInput, CreateTenantResult } from "@shared/modules/authentication/signup/utils/types";
import type { ISignupRepository } from "@shared/modules/authentication/signup/repository/ISignupRepository";

export class SignupRepository
  extends BaseRepository
  implements ISignupRepository
{
  async isTenantCodeAvailable(code: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("is_tenant_code_available", {
      code: code.trim().toLowerCase(),
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
    const { data, error } = await this.db.functions.invoke<
      CreateTenantResult & { error?: string; code?: string }
    >("create-tenant", { body: input });

    if (error) {
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

