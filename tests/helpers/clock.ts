/**
 * Freeze "today". Every month rule reads `new Date()` somewhere (the grid's
 * current-month boundary, the billing-day rules, ageing), so a test that does
 * not pin the clock passes in June and fails in July.
 */
export function freezeToday(year: number, month1to12: number, day: number): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  // Local noon: far enough from either midnight that no timezone shifts the day.
  jest.setSystemTime(new Date(year, month1to12 - 1, day, 12, 0, 0));
}

export function unfreeze(): void {
  jest.useRealTimers();
}
