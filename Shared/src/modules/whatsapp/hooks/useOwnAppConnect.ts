import { useState } from "react";
import type { WhatsAppNumberChoice } from "@shared/core/types";
import {
  nextOwnAppStep,
  numberOptions,
  ownAppInput,
  type OwnAppStep,
} from "@shared/modules/whatsapp/utils/ownAppForm";
import { useWhatsAppSlice } from "@shared/state/hooks/useWhatsAppSlice";

// Editing a key after a step starts over: the number list belonged to the old keys.
export function useOwnAppConnect(consent: boolean, onConnected: () => void) {
  const saving = useWhatsAppSlice((s) => s.saving);
  const connectOwnApp = useWhatsAppSlice((s) => s.connectOwnApp);
  const clearError = useWhatsAppSlice((s) => s.clearError);
  const [token, setTokenText] = useState("");
  const [appSecret, setAppSecretText] = useState("");
  const [wabaId, setWabaIdText] = useState("");
  const [pin, setPinText] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<WhatsAppNumberChoice[]>([]);
  const [step, setStep] = useState<OwnAppStep>("keys");

  const input = ownAppInput(
    { token, appSecret, wabaId, phoneNumberId, pin },
    step,
    consent,
  );

  function backToKeys() {
    setStep("keys");
    setWabaIdText("");
    setNumbers([]);
    setPhoneNumberId(null);
    setPinText("");
  }

  function editKey(setter: (value: string) => void, value: string) {
    setter(value);
    clearError();
    if (step !== "keys") backToKeys();
  }

  async function submit() {
    if (!input) return;
    const result = await connectOwnApp(input);
    if (!result) return;
    const next = nextOwnAppStep(result);
    if (next === "done") {
      setTokenText("");
      setAppSecretText("");
      backToKeys();
      onConnected();
      return;
    }
    if (result.status === "choose_number") setNumbers(result.numbers);
    if (result.status === "needs_pin") setPhoneNumberId(result.phoneNumberId);
    setStep(next);
  }

  return {
    token,
    setToken: (value: string) => editKey(setTokenText, value),
    appSecret,
    setAppSecret: (value: string) => editKey(setAppSecretText, value),
    wabaId,
    setWabaId: (value: string) => {
      setWabaIdText(value);
      clearError();
    },
    pin,
    setPin: (value: string) => {
      setPinText(value);
      clearError();
    },
    step,
    numberOptions: numberOptions(numbers),
    phoneNumberId,
    choosePhoneNumber: setPhoneNumberId,
    saving,
    canSubmit: !!input && !saving,
    submit,
  };
}

export type OwnAppConnect = ReturnType<typeof useOwnAppConnect>;
