import { repeatDelayAfter } from "@/src/shared/hooks/useHoldRepeat";

// TC-HR-* — holding a stepper button repeats the step. The schedule is the only
// part worth pinning: too slow and a hold feels broken, too fast and the number
// runs away before a finger can lift.

describe("hold-to-repeat: the delay schedule", () => {
  it("TC-HR-01 starts at the steady rate", () => {
    expect(repeatDelayAfter(1)).toBe(80);
    expect(repeatDelayAfter(10)).toBe(80);
  });

  it("TC-HR-02 accelerates only AFTER the tenth repeat", () => {
    expect(repeatDelayAfter(11)).toBe(30);
    expect(repeatDelayAfter(50)).toBe(30);
  });

  it("TC-HR-03 never returns a delay that would busy-loop", () => {
    for (let n = 0; n <= 200; n += 1) {
      expect(repeatDelayAfter(n)).toBeGreaterThan(0);
    }
  });
});
