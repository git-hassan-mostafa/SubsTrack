import { AppError } from "../../../core/errors.js";
import { OptionRepository } from "../repository/OptionRepository.js";

const OPTION_KEY = /^[A-Za-z0-9_.]+$/;

function validate(input) {
  const key = (input.key ?? "").trim();
  if (!key) throw new AppError("Key is required");
  if (!OPTION_KEY.test(key)) {
    throw new AppError("Key may only contain letters, numbers, dots, and underscores");
  }
  const value = (input.value ?? "").trim();
  if (!value) throw new AppError("Value is required");
  const description = input.description?.trim() || null;
  return { key, value, description };
}

export class OptionService {
  #repository = new OptionRepository();

  getOptions() {
    return this.#repository.findAll();
  }

  createOption(input) {
    return this.#repository.create(validate(input));
  }

  // Key is what code looks up (LiraRate…), so only value + description change.
  updateOption(id, input) {
    const { value, description } = validate(input);
    return this.#repository.update(id, { value, description });
  }

  deleteOption(id) {
    return this.#repository.delete(id);
  }
}
