import { useTenantStore } from '@/src/modules/tenants/store/tenantStore';
import { SaasTierListScreen } from '@/src/modules/saas-tiers/screens/SaasTierListScreen';

export default function SaasTiersTab() {
  const { tenants } = useTenantStore();
  return <SaasTierListScreen tenants={tenants} />;
}
