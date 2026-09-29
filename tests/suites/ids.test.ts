import {
  configureShared,
  runtime,
  type RuntimeIds,
} from "@shared/core/runtime/runtime";
import { webCryptoIds } from "@shared/core/runtime/webCryptoIds";
import { deterministicId } from "@shared/core/utils/ids";
import { phoneIds } from "@/src/platform/phoneIds";

// Phone and web must hash alike, or two devices would each create one bill.
const GOLDEN: [string[], string][] = [
  [["line-1", "2026-03-01"], "470aacab-0250-5cae-a9c4-e1d2ff97bedd"],
  [["replaces", "typo"], "a42d1642-c375-5403-a279-be26dc30e335"],
  [["شهر", "اشتراك"], "000f1857-6f8a-5fec-9036-18099ae3ef68"],
  [[""], "da39a3ee-5e6b-5b0d-b255-bfef95601890"],
];

const configured = runtime();

async function idsWith(ids: RuntimeIds): Promise<string[]> {
  configureShared({ ...configured, ids });
  try {
    return await Promise.all(GOLDEN.map(([parts]) => deterministicId(...parts)));
  } finally {
    configureShared(configured);
  }
}

describe("deterministicId", () => {
  it("TC-ID-01 the phone path gives the pinned ids", async () => {
    expect(await idsWith(phoneIds)).toEqual(GOLDEN.map(([, id]) => id));
  });

  it("TC-ID-02 the WebCrypto path gives the same pinned ids", async () => {
    expect(await idsWith(webCryptoIds)).toEqual(GOLDEN.map(([, id]) => id));
  });

  it("TC-ID-03 every id is a version-5 uuid with the RFC variant", () => {
    for (const [, id] of GOLDEN) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
