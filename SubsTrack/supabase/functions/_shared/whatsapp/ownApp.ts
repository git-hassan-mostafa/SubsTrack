// @ts-nocheck — Deno runtime file.
import { randomPin } from "./crypto.ts";
import {
  assertNotOwnedElsewhere,
  PIN_MISMATCH_CODES,
  registerNumber,
  saveAccount,
  setupTemplates,
  setWebhookOverride,
} from "./connect.ts";
import {
  assertAppSecret,
  businessIdsOfToken,
  fetchPhoneDetails,
  type GraphCredentials,
  inspectOwnToken,
  MetaError,
  ownedWabaIds,
  type PhoneNumberChoice,
  wabaIdsOfToken,
  wabaPhoneNumbers,
} from "./graph.ts";
import { HttpError, META_ID_REGEX } from "./http.ts";

const REQUIRED_SCOPES = ["whatsapp_business_messaging", "whatsapp_business_management"];
const MAX_WABAS = 10;
const MAX_SECRET_LENGTH = 1000;
const INVALID_TOKEN_CODES = new Set([102, 190]);

type Log = (event: string, detail?: Record<string, unknown>) => void;

export interface OwnAppRequest {
  tenantId: string;
  userId: string;
  token: string;
  appSecret: string;
  phoneNumberId: string | null;
  pin: string | null;
}

interface NumberOnWaba extends PhoneNumberChoice {
  wabaId: string;
}

export function readOwnAppBody(body): Omit<OwnAppRequest, "tenantId" | "userId"> {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const appSecret = typeof body.appSecret === "string" ? body.appSecret.trim() : "";
  if (!token || !appSecret || token.length > MAX_SECRET_LENGTH || appSecret.length > MAX_SECRET_LENGTH) {
    throw new HttpError(400, "own_app_keys_missing", "Enter the access token and the app secret.");
  }
  const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId) : null;
  if (phoneNumberId && !META_ID_REGEX.test(phoneNumberId)) {
    throw new HttpError(400, "invalid_signup", "Unknown phone number.");
  }
  const pin = body.pin ? String(body.pin) : null;
  if (pin && !/^\d{6}$/.test(pin)) throw new HttpError(400, "invalid_pin", "The PIN must be 6 digits.");
  return { token, appSecret, phoneNumberId, pin };
}

// A wrong secret makes Meta reject the appsecret_proof before anything else.
async function inspectKeys(creds: GraphCredentials) {
  let info;
  try {
    info = await inspectOwnToken(creds);
  } catch (error) {
    if (error instanceof MetaError && /appsecret_proof/i.test(error.message)) {
      throw new HttpError(400, "own_app_secret_wrong", "The app secret does not match the app of this token.");
    }
    if (error instanceof MetaError && INVALID_TOKEN_CODES.has(error.code)) {
      throw new HttpError(400, "own_app_token_invalid", "This access token is not valid.");
    }
    throw error;
  }
  if (!info?.is_valid || !info.app_id) {
    throw new HttpError(400, "own_app_token_invalid", "This access token is not valid.");
  }
  if (Number(info.expires_at ?? 0) !== 0) {
    throw new HttpError(400, "own_app_token_expires", "This token expires. Use a permanent system user token.");
  }
  const scopes = Array.isArray(info.scopes) ? info.scopes.map(String) : [];
  if (REQUIRED_SCOPES.some((scope) => !scopes.includes(scope))) {
    throw new HttpError(400, "own_app_token_permissions", "The token needs the whatsapp_business_messaging and whatsapp_business_management permissions.");
  }
  const appId = String(info.app_id);
  try {
    await assertAppSecret(appId, creds.appSecret);
  } catch (error) {
    if (error instanceof MetaError && !error.networkFailure) {
      throw new HttpError(400, "own_app_secret_wrong", "The app secret does not match the app of this token.");
    }
    throw error;
  }
  return { appId, info };
}

// No target ids means "every account": ask the businesses the token can manage.
async function reachableWabaIds(info, creds: GraphCredentials): Promise<string[]> {
  const direct = wabaIdsOfToken(info);
  if (direct.length > 0) return direct.slice(0, MAX_WABAS);
  const ids = new Set<string>();
  for (const businessId of businessIdsOfToken(info)) {
    const owned = await ownedWabaIds(businessId, creds).catch(() => []);
    for (const id of owned) ids.add(id);
  }
  return [...ids].slice(0, MAX_WABAS);
}

async function reachableNumbers(info, creds: GraphCredentials): Promise<NumberOnWaba[]> {
  const wabaIds = await reachableWabaIds(info, creds);
  if (wabaIds.length === 0) {
    throw new HttpError(409, "own_app_no_waba", "This token cannot reach any WhatsApp Business Account. Give the system user access to it in Meta Business Settings.");
  }
  const numbers: NumberOnWaba[] = [];
  for (const wabaId of wabaIds) {
    for (const phone of await wabaPhoneNumbers(wabaId, creds)) numbers.push({ ...phone, wabaId });
  }
  if (numbers.length === 0) {
    throw new HttpError(409, "own_app_no_number", "This WhatsApp Business Account has no phone number yet. Add one in Meta first.");
  }
  return numbers;
}

function pickNumber(numbers: NumberOnWaba[], phoneNumberId: string | null): NumberOnWaba | null {
  if (phoneNumberId) {
    const chosen = numbers.find((n) => n.phoneNumberId === phoneNumberId);
    if (!chosen) throw new HttpError(400, "invalid_signup", "Unknown phone number.");
    return chosen;
  }
  return numbers.length === 1 ? numbers[0] : null;
}

// Registers a number Meta does not show as connected; a PIN it already has must be typed.
async function ensureRegistered(phoneNumberId: string, creds: GraphCredentials, typedPin: string | null) {
  const details = await fetchPhoneDetails(phoneNumberId, creds);
  if (details?.status === "CONNECTED") return { registered: true, pin: null };
  const pin = typedPin ?? randomPin();
  try {
    await registerNumber(phoneNumberId, creds, pin);
    return { registered: true, pin };
  } catch (error) {
    if (error instanceof MetaError && PIN_MISMATCH_CODES.has(error.code)) {
      if (typedPin) throw new HttpError(409, "wrong_pin", "That PIN is not correct. Please try again.");
      return { registered: false, pin: null };
    }
    throw error;
  }
}

// Stateless: every step re-sends the keys, so nothing half-done is ever stored.
export async function connectOwnApp(service, request: OwnAppRequest, log: Log) {
  const creds = { token: request.token, appSecret: request.appSecret };
  const { appId, info } = await inspectKeys(creds);
  const numbers = await reachableNumbers(info, creds);
  const chosen = pickNumber(numbers, request.phoneNumberId);
  if (!chosen) {
    return {
      status: "choose_number",
      numbers: numbers.map(({ phoneNumberId, displayPhoneNumber, verifiedName }) => ({
        phoneNumberId,
        displayPhoneNumber,
        verifiedName,
      })),
    };
  }

  await assertNotOwnedElsewhere(service, request.tenantId, chosen.phoneNumberId);
  const registration = await ensureRegistered(chosen.phoneNumberId, creds, request.pin);
  if (!registration.registered) return { status: "needs_pin", phoneNumberId: chosen.phoneNumberId };

  const saved = await saveAccount(service, {
    tenantId: request.tenantId,
    userId: request.userId,
    consentAt: new Date().toISOString(),
    wabaId: chosen.wabaId,
    phoneNumberId: chosen.phoneNumberId,
    businessId: null,
    appId,
    creds,
    ownAppSecret: true,
    pin: registration.pin,
    coexistence: false,
    historySyncStarted: false,
  });
  const webhookAuto = await setWebhookOverride(service, saved.account, creds, log);
  await setupTemplates(service, saved.account, creds, log);
  log("connected_own_app", { tenantId: request.tenantId, accountId: saved.account.id, webhookAuto });
  return {
    status: "connected",
    displayPhoneNumber: saved.displayPhoneNumber,
    verifiedName: saved.verifiedName,
  };
}
