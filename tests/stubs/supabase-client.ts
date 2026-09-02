// Cuts the whole native chain at its source: the real module pulls in
// react-native-url-polyfill, AppState and AsyncStorage before it even builds a
// client. Any repository that actually issues a query in a unit test throws.
const boom = () => {
  throw new Error('Supabase was called in a unit test - mock the repository');
};
export const supabase = new Proxy({}, { get: boom });
export default supabase;
