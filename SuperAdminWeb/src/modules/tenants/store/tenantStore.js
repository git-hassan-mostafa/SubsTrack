import { createStore } from "../../../core/createStore.js";
import { errorMessage } from "../../../core/errors.js";
import { TenantService } from "../services/TenantService.js";

const service = new TenantService();

const INITIAL = {
  tenants: [],
  loaded: false,
  loading: false,
  error: null,
  detailsFor: null,
  counts: null,
  countsLoading: false,
  owners: [],
  ownersLoading: false,
  detailsError: null,
  saving: false,
  formError: null,
};

export const tenantStore = createStore(INITIAL);

function patchTenant(tenantId, patch) {
  tenantStore.setState((s) => ({
    tenants: s.tenants.map((t) => (t.id === tenantId ? { ...t, ...patch } : t)),
  }));
}

export function tenantById(tenantId) {
  return tenantStore.getState().tenants.find((t) => t.id === tenantId) ?? null;
}

export async function fetchTenants() {
  tenantStore.setState({ loading: true, error: null });
  try {
    const tenants = await service.getTenants();
    tenantStore.setState({ tenants, loaded: true, loading: false });
  } catch (e) {
    tenantStore.setState({ error: errorMessage(e), loading: false });
  }
}

// Cleared + tagged up front: a late answer never shows another tenant's data.
export async function fetchDetails(tenantId) {
  tenantStore.setState({
    detailsFor: tenantId,
    counts: null,
    countsLoading: true,
    owners: [],
    ownersLoading: true,
    detailsError: null,
  });
  const settle = (promise, key, loadingKey) =>
    promise
      .then((value) => ({ [key]: value }), (e) => ({ detailsError: errorMessage(e) }))
      .then((patch) => {
        if (tenantStore.getState().detailsFor !== tenantId) return;
        tenantStore.setState({ ...patch, [loadingKey]: false });
      });
  await Promise.all([
    settle(service.getTenantCounts(tenantId), "counts", "countsLoading"),
    settle(service.getOwners(tenantId), "owners", "ownersLoading"),
  ]);
}

export function closeDetails() {
  tenantStore.setState({ detailsFor: null, detailsError: null });
}

export async function resetOwnerPassword(userId, password) {
  tenantStore.setState({ detailsError: null });
  try {
    await service.resetOwnerPassword(userId, password);
    return true;
  } catch (e) {
    tenantStore.setState({ detailsError: errorMessage(e) });
    return false;
  }
}

export async function createTenant(input) {
  tenantStore.setState({ saving: true, formError: null });
  try {
    const tenant = await service.createTenant(input);
    tenantStore.setState((s) => ({ tenants: [...s.tenants, tenant], saving: false }));
    return true;
  } catch (e) {
    tenantStore.setState({ formError: errorMessage(e), saving: false });
    return false;
  }
}

export async function updateTenant(tenantId, input) {
  tenantStore.setState({ saving: true, formError: null });
  try {
    const pending = tenantById(tenantId)?.pendingRequest ?? null;
    const updated = await service.updateTenant(tenantId, input, pending);
    patchTenant(tenantId, updated);
    tenantStore.setState({ saving: false });
    return true;
  } catch (e) {
    tenantStore.setState({ formError: errorMessage(e), saving: false });
    return false;
  }
}

export async function acceptRequest(tenantId, requestId, granted) {
  tenantStore.setState({ saving: true, formError: null });
  try {
    const current = tenantById(tenantId);
    const { customers, plans } = await service.acceptRequest(requestId, granted, {
      customers: current?.customerAllowance ?? 0,
      plans: current?.planAllowance ?? 0,
    });
    patchTenant(tenantId, { customerAllowance: customers, planAllowance: plans, pendingRequest: null });
    tenantStore.setState({ saving: false });
    return true;
  } catch (e) {
    tenantStore.setState({ formError: errorMessage(e), saving: false });
    return false;
  }
}

export async function declineRequest(tenantId, requestId) {
  tenantStore.setState({ saving: true, formError: null });
  try {
    await service.declineRequest(requestId);
    patchTenant(tenantId, { pendingRequest: null });
    tenantStore.setState({ saving: false });
    return true;
  } catch (e) {
    tenantStore.setState({ formError: errorMessage(e), saving: false });
    return false;
  }
}

export function clearError() {
  tenantStore.setState({ error: null });
}

export function clearDetailsError() {
  tenantStore.setState({ detailsError: null });
}

export function clearFormError() {
  tenantStore.setState({ formError: null });
}

export function resetTenants() {
  tenantStore.setState(INITIAL);
}
