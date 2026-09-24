import {
  MAX_SEND_ATTEMPTS,
  attentionCodeFor,
  backoffMs,
  buildTemplateComponents,
  buildTemplateMessage,
  classifyMetaError,
  detectParameterFormat,
  errorKeyFor,
  isStopRequest,
  normalizeTier,
  renderTemplate,
  sanitizeParam,
  shouldRetry,
  templateParamNames,
  tierLimit,
} from "@/supabase/functions/_shared/whatsapp/rules";

describe("classifyMetaError", () => {
  it("TC-WA-R-01 throttling and Meta outages are retried", () => {
    for (const code of [130429, 131056, 131000, 131016, 131057, 133004, 131048]) {
      expect(classifyMetaError(code, 400)).toBe("retry");
    }
    expect(classifyMetaError(null, 503)).toBe("retry");
  });

  it("TC-WA-R-02 a bad number or bad template is never retried", () => {
    for (const code of [100, 131026, 132000, 132001, 132012, 132015, 132016]) {
      expect(classifyMetaError(code, 400)).toBe("permanent");
    }
  });

  it("TC-WA-R-03 token, payment and restriction errors stop the whole account", () => {
    for (const code of [190, 131042, 368, 133010]) {
      expect(classifyMetaError(code, 400)).toBe("account");
    }
    expect(attentionCodeFor(131042)).toBe("payment_method");
    expect(attentionCodeFor(190)).toBe("token_invalid");
    expect(attentionCodeFor(131026)).toBeNull();
  });

  it("TC-WA-R-04 every failure gets a key the app can translate", () => {
    expect(errorKeyFor(131026)).toBe("not_on_whatsapp");
    expect(errorKeyFor(132015)).toBe("template_paused");
    expect(errorKeyFor(null, 502)).toBe("meta_unavailable");
    expect(errorKeyFor(999999)).toBe("meta_error");
  });
});

describe("retry timing", () => {
  it("TC-WA-R-05 backoff grows, is capped at 30 minutes, and stays inside its jitter", () => {
    const low = () => 0;
    const high = () => 1;
    expect(backoffMs(1, low)).toBe(24_000);
    expect(backoffMs(1, high)).toBe(36_000);
    expect(backoffMs(2, low)).toBe(48_000);
    expect(backoffMs(30, high)).toBe(Math.round(30 * 60_000 * 1.2));
  });

  it("TC-WA-R-06 a message stops being retried after the last attempt", () => {
    expect(shouldRetry(MAX_SEND_ATTEMPTS - 1)).toBe(true);
    expect(shouldRetry(MAX_SEND_ATTEMPTS)).toBe(false);
  });
});

describe("daily messaging tier", () => {
  it("TC-WA-R-07 an unknown tier is treated as the smallest one", () => {
    expect(tierLimit(null)).toBe(250);
    expect(tierLimit("TIER_SOMETHING_NEW")).toBe(250);
    expect(tierLimit("TIER_2K")).toBe(2000);
    expect(tierLimit("TIER_UNLIMITED")).toBe(Number.POSITIVE_INFINITY);
  });

  it("TC-WA-R-08 a numeric limit from a webhook maps onto a tier", () => {
    expect(normalizeTier("TIER_10K")).toBe("TIER_10K");
    expect(normalizeTier(2000)).toBe("TIER_2K");
    expect(normalizeTier(250)).toBe("TIER_250");
    expect(normalizeTier(undefined)).toBeNull();
  });
});

describe("STOP replies", () => {
  it("TC-WA-R-09 an exact STOP word in English or Arabic opts out", () => {
    for (const text of ["STOP", " stop ", "Stop!", "unsubscribe", "إيقاف", "ايقاف", "توقف"]) {
      expect(isStopRequest(text)).toBe(true);
    }
  });

  it("TC-WA-R-10 a sentence that merely contains stop does not", () => {
    for (const text of ["please stop by tomorrow", "I paid, stop?? no", "", null]) {
      expect(isStopRequest(text)).toBe(false);
    }
  });
});

describe("parameters and payload", () => {
  it("TC-WA-R-11 newlines, tabs and runs of spaces are removed before Meta sees them", () => {
    expect(sanitizeParam("line one\nline two\t\tend     x")).toBe("line one line two end x");
    expect(sanitizeParam("  abc  ", 2)).toBe("ab");
    expect(sanitizeParam(42)).toBe("");
  });

  it("TC-WA-R-12 placeholders are read in order, once each", () => {
    expect(templateParamNames("Hi {{name}}, {{amount}} for {{name}}")).toEqual(["name", "amount"]);
    expect(detectParameterFormat(["1", "2"])).toBe("positional");
    expect(detectParameterFormat(["name"])).toBe("named");
  });

  it("TC-WA-R-13 rendering fills known values and leaves unknown ones visible", () => {
    expect(renderTemplate("Hi {{name}} {{other}}", { name: "Rami" })).toBe("Hi Rami {{other}}");
  });

  it("TC-WA-R-14 positional values are sent in placeholder order", () => {
    const [body] = buildTemplateComponents({
      format: "positional",
      values: [
        { name: "2", value: "b" },
        { name: "1", value: "a" },
      ],
    });
    expect(body.parameters).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ]);
  });

  it("TC-WA-R-15 the send payload carries our row id so a late webhook can find it", () => {
    const payload = buildTemplateMessage({
      to: "+9613123456",
      templateName: "sijil_payment_reminder_v1",
      language: "ar",
      variables: { format: "named", values: [{ name: "customer_name", value: "Rami" }] },
      callbackId: "row-1",
    });
    expect(payload.biz_opaque_callback_data).toBe("row-1");
    expect(payload.template.language.code).toBe("ar");
    expect(payload.template.components[0].parameters[0]).toEqual({
      type: "text",
      parameter_name: "customer_name",
      text: "Rami",
    });
  });
});
