// A client that throws the moment anything is actually queried, so a test that
// forgot to mock its repository fails loudly instead of hanging.
const boom = () => {
  throw new Error('Supabase was called in a unit test - mock the repository');
};
export function createClient() {
  return new Proxy({}, { get: boom });
}
export default { createClient };
