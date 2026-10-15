import { useState } from "react";
import {
  getNowDateTimeString,
  getTodayDateString,
  pickedInstantIso,
} from "@shared/core/utils/date";

// A date + time field that saves the moment of saving until the user picks one.
export function usePickedInstant() {
  const [today] = useState(getTodayDateString);
  const [value, setValue] = useState(getNowDateTimeString);
  const [picked, setPicked] = useState(false);

  const pick = (next: string) => {
    if (next === value) return;
    setValue(next);
    setPicked(true);
  };

  const reset = () => {
    setValue(getNowDateTimeString());
    setPicked(false);
  };

  return {
    value,
    picked,
    today,
    pick,
    reset,
    toIso: () => pickedInstantIso(value, picked),
  };
}
