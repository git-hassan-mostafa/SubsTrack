import { createStore } from "../../../core/createStore.js";
import { errorMessage } from "../../../core/errors.js";
import { OptionService } from "../services/OptionService.js";

const service = new OptionService();

const INITIAL = {
  options: [],
  loaded: false,
  loading: false,
  saving: false,
  error: null,
  formError: null,
};

export const optionStore = createStore(INITIAL);

const byKey = (a, b) => a.key.localeCompare(b.key);

export async function fetchOptions() {
  optionStore.setState({ loading: true, error: null });
  try {
    const options = await service.getOptions();
    optionStore.setState({ options, loaded: true, loading: false });
  } catch (e) {
    optionStore.setState({ error: errorMessage(e), loading: false });
  }
}

export async function createOption(input) {
  optionStore.setState({ saving: true, formError: null });
  try {
    const created = await service.createOption(input);
    optionStore.setState((s) => ({
      options: [...s.options, created].sort(byKey),
      saving: false,
    }));
    return true;
  } catch (e) {
    optionStore.setState({ formError: errorMessage(e), saving: false });
    return false;
  }
}

export async function updateOption(id, input) {
  optionStore.setState({ saving: true, formError: null });
  try {
    const updated = await service.updateOption(id, input);
    optionStore.setState((s) => ({
      options: s.options.map((o) => (o.id === id ? updated : o)),
      saving: false,
    }));
    return true;
  } catch (e) {
    optionStore.setState({ formError: errorMessage(e), saving: false });
    return false;
  }
}

export async function deleteOption(id) {
  optionStore.setState({ saving: true, error: null });
  try {
    await service.deleteOption(id);
    optionStore.setState((s) => ({
      options: s.options.filter((o) => o.id !== id),
      saving: false,
    }));
    return true;
  } catch (e) {
    optionStore.setState({ error: errorMessage(e), saving: false });
    return false;
  }
}

export function clearError() {
  optionStore.setState({ error: null });
}

export function clearFormError() {
  optionStore.setState({ formError: null });
}

export function resetOptions() {
  optionStore.setState(INITIAL);
}
