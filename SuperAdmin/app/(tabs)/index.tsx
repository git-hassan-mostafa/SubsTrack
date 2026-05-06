import { useSaasTierStore } from '@/src/modules/saas-tiers/store/saasTierStore';
import { TenantListScreen } from '@/src/modules/tenants/screens/TenantListScreen';

export default function TenantsTab() {
  const { saasTiers } = useSaasTierStore();
  return <TenantListScreen saasTiers={saasTiers} />;
}
