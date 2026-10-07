import type { PickersInputLocaleText } from "@mui/x-date-pickers/locales";
import type { SupportedLanguage } from "@shared/core/i18n";

const VIEW_NAMES: Record<string, string> = {
  year: "السنة",
  month: "الشهر",
  day: "اليوم",
  hours: "الساعات",
  minutes: "الدقائق",
  seconds: "الثواني",
  meridiem: "صباحاً/مساءً",
};

function viewName(view: string): string {
  return VIEW_NAMES[view] ?? view;
}

// MUI ships no Arabic date-picker pack; only what our pickers show or speak
const PICKERS_ARABIC: PickersInputLocaleText = {
  previousMonth: "الشهر السابق",
  nextMonth: "الشهر التالي",
  openPreviousView: "فتح العرض السابق",
  openNextView: "فتح العرض التالي",
  calendarViewSwitchingButtonAriaLabel: (view) =>
    view === "year" ? "عرض السنوات مفتوح، انتقل إلى عرض التقويم" : "عرض التقويم مفتوح، انتقل إلى عرض السنوات",
  cancelButtonLabel: "إلغاء",
  clearButtonLabel: "مسح",
  okButtonLabel: "موافق",
  todayButtonLabel: "اليوم",
  nextStepButtonLabel: "التالي",
  datePickerToolbarTitle: "اختر التاريخ",
  dateTimePickerToolbarTitle: "اختر التاريخ والوقت",
  timePickerToolbarTitle: "اختر الوقت",
  clockLabelText: (view, formattedTime) =>
    `اختر ${viewName(view)}. ${formattedTime ? `الوقت المختار ${formattedTime}` : "لم يُختر وقت"}`,
  hoursClockNumberText: (hours) => `${hours} ساعة`,
  minutesClockNumberText: (minutes) => `${minutes} دقيقة`,
  secondsClockNumberText: (seconds) => `${seconds} ثانية`,
  selectViewText: (view) => `اختر ${viewName(view)}`,
  openDatePickerDialogue: (formattedDate) =>
    formattedDate ? `اختر التاريخ، التاريخ المختار ${formattedDate}` : "اختر التاريخ",
  openTimePickerDialogue: (formattedTime) =>
    formattedTime ? `اختر الوقت، الوقت المختار ${formattedTime}` : "اختر الوقت",
  fieldClearLabel: "مسح",
  timeTableLabel: "اختر الوقت",
  dateTableLabel: "اختر التاريخ",
  year: "السنة",
  month: "الشهر",
  day: "اليوم",
  weekDay: "يوم الأسبوع",
  hours: "الساعات",
  minutes: "الدقائق",
  seconds: "الثواني",
  meridiem: "صباحاً/مساءً",
  empty: "فارغ",
};

export const PICKERS_TEXT: Record<SupportedLanguage, PickersInputLocaleText | undefined> = {
  en: undefined,
  ar: PICKERS_ARABIC,
};
