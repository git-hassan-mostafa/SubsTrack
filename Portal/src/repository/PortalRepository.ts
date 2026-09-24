import type {
  DbCharge,
  DbCollection,
  DbCurrency,
  DbCustomer,
  DbCustomerPlan,
  DbSale,
  DbSkippedMonth,
} from "@/src/core/types/db";

// The raw response of the customer-portal edge function: snake_case Db* rows,
// because that function IS this app's database. Mapping to domain types happens
// one layer up, through SubsTrack's own mappers.
export interface PortalPayload {
  org: { name: string };
  branch: { name: string } | null;
  customer: DbCustomer;
  lines: DbCustomerPlan[];
  charges: DbCharge[];
  paidByCharge: Record<string, number>;
  collections: DbCollection[];
  sales: DbSale[];
  skips: DbSkippedMonth[];
  currencies: DbCurrency[];
  collectors: { id: string; full_name: string }[];
  settings: Record<string, string | null>;
}

// Mirrors the function's own `code` values so the UI can pick a message without
// parsing a sentence. `bad_link` and `not_configured` never come from the
// server - they are the two ways this app can fail before it sends anything.
export type PortalErrorCode =
  | "bad_credentials"
  | "locked"
  | "unavailable"
  | "bad_token"
  | "no_token"
  | "offline"
  | "server_error"
  | "bad_link"
  | "not_configured";

export class PortalError extends Error {
  readonly code: PortalErrorCode;
  constructor(code: PortalErrorCode) {
    super(code);
    this.code = code;
  }
}

const ENDPOINT = import.meta.env.VITE_PORTAL_FUNCTION_URL as string | undefined;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Supabase's gateway 401s a function call carrying no API key even when that
// function is verify_jwt = false - see docs/edge-functions.md.
async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!ENDPOINT || !API_KEY) throw new PortalError("not_configured");

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PortalError("offline");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.code;
    throw new PortalError(isPortalErrorCode(code) ? code : "server_error");
  }
  return payload as T;
}

function isPortalErrorCode(value: unknown): value is PortalErrorCode {
  return (
    typeof value === "string" &&
    [
      "bad_credentials",
      "locked",
      "unavailable",
      "bad_token",
      "no_token",
      "offline",
      "server_error",
    ].includes(value)
  );
}

class PortalRepository {
  async login(customerId: string, password: string): Promise<string> {
    const { token } = await call<{ token: string }>({
      action: "login",
      customerId,
      password,
    });
    return token;
  }

  fetchPayload(token: string): Promise<PortalPayload> {
    return call<PortalPayload>({ action: "data", token });
  }
}

export const portalRepository = new PortalRepository();
