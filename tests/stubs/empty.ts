// Placeholder for native modules the money graph imports but never calls.
// AsyncStorage is the exception: zustand's persist middleware DOES call it at
// hydration, so the default export answers "nothing stored" instead of throwing.
export default {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};
export const getLocales = () => [{ languageCode: "en", languageTag: "en-US" }];
export const getItem = async () => null;
export const setItem = async () => {};
export const removeItem = async () => {};
