// The portal never talks to Supabase. Its one read goes through the public
// customer-portal edge function, which is the only thing that can scope a read
// to a single customer. Anything that reaches for a client here is a bug.
const boom = () => {
  throw new Error(
    "The portal must not call Supabase directly - use PortalRepository",
  );
};
export const supabase = new Proxy({}, { get: boom });
export default supabase;
