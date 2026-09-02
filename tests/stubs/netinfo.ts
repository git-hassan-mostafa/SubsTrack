// The offline repositories check connectivity at module load.
const state = { isConnected: true, isInternetReachable: true };
export default {
  fetch: async () => state,
  addEventListener: () => () => {},
  configure: () => {},
};
