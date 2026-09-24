import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { formatShortDate } from "@/src/core/utils/formatDate";
import type { Tenant } from "@/src/core/types";
import { useTenantStore } from "../store/tenantStore";
import { MIN_CUSTOMER_ALLOWANCE } from "../services/TenantService";

interface Props {
  visible: boolean;
  tenant?: Tenant | null;
  onDismiss: () => void;
}

const DEFAULT_ALLOWANCE = String(MIN_CUSTOMER_ALLOWANCE);
const DEFAULT_PRICE = "0.15";

export function TenantFormSheet({ visible, tenant, onDismiss }: Props) {
  const {
    createTenant,
    updateTenant,
    acceptRequest,
    declineRequest,
    loading,
    error,
    clearError,
  } = useTenantStore();

  const isEditing = !!tenant;

  const [name, setName] = useState("");
  const [tenantCode, setTenantCode] = useState("");
  const [active, setActive] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [allowance, setAllowance] = useState(DEFAULT_ALLOWANCE);
  const [planAllowance, setPlanAllowance] = useState(DEFAULT_ALLOWANCE);
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [granted, setGranted] = useState("");
  const [grantedPlans, setGrantedPlans] = useState("");
  const [adminUserName, setAdminUserName] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const pending = tenant?.pendingRequest ?? null;

  useEffect(() => {
    if (visible) {
      setName(tenant?.name ?? "");
      setTenantCode(tenant?.tenantCode ?? "");
      setActive(tenant?.active ?? true);
      setWhatsappEnabled(tenant?.whatsappEnabled ?? false);
      setAllowance(
        tenant ? String(tenant.customerAllowance) : DEFAULT_ALLOWANCE,
      );
      setPlanAllowance(
        tenant ? String(tenant.planAllowance) : DEFAULT_ALLOWANCE,
      );
      setPrice(tenant ? String(tenant.pricePerPlanUsd) : DEFAULT_PRICE);
      setGranted(
        tenant?.pendingRequest
          ? String(tenant.pendingRequest.requestedCount)
          : "",
      );
      setGrantedPlans(
        tenant?.pendingRequest
          ? String(tenant.pendingRequest.requestedPlans)
          : "",
      );
      setAdminUserName("");
      setAdminFullName("");
      setAdminPassword("");
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tenant]);

  async function handleSubmit() {
    let success: boolean;
    if (isEditing) {
      success = await updateTenant(tenant!.id, {
        name,
        active,
        customerAllowance: Number(allowance),
        planAllowance: Number(planAllowance),
        pricePerPlanUsd: Number(price),
        whatsappEnabled,
      });
    } else {
      success = await createTenant({
        name,
        tenantCode,
        adminUserName,
        adminFullName,
        adminPassword,
        customerAllowance: Number(allowance),
        planAllowance: Number(planAllowance),
        pricePerPlanUsd: Number(price),
      });
    }
    if (success) onDismiss();
  }

  // Both fields must follow the accepted raise, or pressing Save next would
  // write the pre-accept numbers straight back over them.
  async function handleAccept() {
    if (!tenant || !pending) return;
    const grant = { customers: Number(granted), plans: Number(grantedPlans) };
    const ok = await acceptRequest(tenant.id, pending.id, grant);
    if (!ok) return;
    const customers = Number(allowance) + grant.customers;
    setAllowance(String(customers));
    setPlanAllowance(
      String(Math.max(Number(planAllowance) + grant.plans, customers)),
    );
  }

  async function handleDecline() {
    if (!tenant || !pending) return;
    await declineRequest(tenant.id, pending.id);
  }

  const grantedValid =
    Number.isInteger(Number(granted)) &&
    Number.isInteger(Number(grantedPlans)) &&
    Number(granted) >= 0 &&
    Number(grantedPlans) >= 0 &&
    Number(granted) + Number(grantedPlans) >= 1;
  const billingValid =
    Number.isInteger(Number(allowance)) &&
    Number(allowance) >= MIN_CUSTOMER_ALLOWANCE &&
    Number.isInteger(Number(planAllowance)) &&
    Number(planAllowance) >= Number(allowance) &&
    Number.isFinite(Number(price)) &&
    Number(price) >= 0;

  const canSubmit = isEditing
    ? !!name.trim() && !!tenantCode.trim() && billingValid
    : !!name.trim() &&
      !!tenantCode.trim() &&
      !!adminUserName.trim() &&
      !!adminFullName.trim() &&
      adminPassword.length >= 8 &&
      billingValid;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEditing ? "Edit Tenant" : "Add Tenant"}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {pending ? (
            <View style={styles.requestBox}>
              <Text style={styles.requestTitle}>
                {`Requested +${pending.requestedCount} customers, +${pending.requestedPlans} service lines`}
              </Text>
              <Text style={styles.requestDate}>
                {formatShortDate(pending.createdAt)}
              </Text>
              <Input
                label="Grant customers"
                value={granted}
                onChangeText={setGranted}
                keyboardType="number-pad"
                onFocus={clearError}
              />
              <Input
                label="Grant service lines"
                value={grantedPlans}
                onChangeText={setGrantedPlans}
                keyboardType="number-pad"
                onFocus={clearError}
              />
              <View style={styles.requestActions}>
                <View style={styles.requestAction}>
                  <Button
                    label="Accept"
                    onPress={handleAccept}
                    loading={loading}
                    disabled={!grantedValid}
                    fullWidth
                  />
                </View>
                <Pressable
                  style={styles.declineBtn}
                  onPress={handleDecline}
                  disabled={loading}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <Input
            label="Tenant Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Acme ISP"
            onFocus={clearError}
          />
          {!isEditing && (
            <Input
              label="Tenant Code"
              value={tenantCode}
              onChangeText={setTenantCode}
              placeholder="SubTrack"
              onFocus={clearError}
              autoCapitalize="none"
            />
          )}

          <Input
            label="Customer Allowance"
            value={allowance}
            onChangeText={setAllowance}
            keyboardType="number-pad"
            placeholder={DEFAULT_ALLOWANCE}
            onFocus={clearError}
            error={
              allowance && Number(allowance) < MIN_CUSTOMER_ALLOWANCE
                ? `Minimum ${MIN_CUSTOMER_ALLOWANCE} customers`
                : null
            }
          />

          <Input
            label="Service Line Allowance"
            value={planAllowance}
            onChangeText={setPlanAllowance}
            keyboardType="number-pad"
            placeholder={DEFAULT_ALLOWANCE}
            onFocus={clearError}
            error={
              planAllowance && Number(planAllowance) < Number(allowance)
                ? "Cannot be below the customer allowance"
                : null
            }
          />

          <Input
            label="Price Per Service Line (USD)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder={DEFAULT_PRICE}
            onFocus={clearError}
          />

          {isEditing ? (
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Active</Text>
                <Text style={styles.switchHint}>
                  Inactive tenants cannot log in
                </Text>
              </View>
              <Switch
                value={active}
                onValueChange={setActive}
                trackColor={{ true: "#0a7ea4" }}
              />
            </View>
          ) : null}

          {isEditing ? (
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>WhatsApp messaging allowed</Text>
                <Text style={styles.switchHint}>
                  Lets this tenant connect its own WhatsApp number
                </Text>
              </View>
              <Switch
                value={whatsappEnabled}
                onValueChange={setWhatsappEnabled}
                trackColor={{ true: "#0a7ea4" }}
              />
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Super Admin User</Text>
                <Text style={styles.sectionHint}>
                  A super admin account will be created for this tenant
                </Text>
              </View>

              <Input
                label="Super Admin User Name"
                value={adminUserName}
                onChangeText={setAdminUserName}
                placeholder="admin"
                autoCapitalize="none"
                onFocus={clearError}
              />

              <Input
                label="Super Admin Full Name"
                value={adminFullName}
                onChangeText={setAdminFullName}
                placeholder="e.g. John Smith"
                autoCapitalize="words"
                onFocus={clearError}
              />

              <Input
                label="Super Admin Password"
                value={adminPassword}
                onChangeText={setAdminPassword}
                placeholder="Min. 8 characters"
                secureTextEntry
                onFocus={clearError}
              />

              {adminPassword.length > 0 && adminPassword.length < 8 ? (
                <Text style={styles.hint}>
                  Password must be at least 8 characters
                </Text>
              ) : null}
            </>
          )}

          <View style={styles.submitRow}>
            <Button
              label={isEditing ? "Save Changes" : "Create Tenant"}
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              fullWidth
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: { fontSize: 18, fontWeight: "600", color: "#1e293b" },
  close: { fontSize: 16, color: "#0a7ea4", fontWeight: "500" },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  requestBox: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  requestTitle: { fontSize: 15, fontWeight: "600", color: "#9a3412" },
  requestDate: {
    fontSize: 12,
    color: "#c2410c",
    marginTop: 2,
    marginBottom: 12,
  },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  requestAction: { flex: 1 },
  declineBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  declineText: { fontSize: 14, color: "#ef4444", fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    marginBottom: 16,
  },
  switchLabel: { fontSize: 14, fontWeight: "500", color: "#374151" },
  switchHint: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  sectionHeader: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  sectionHint: { fontSize: 13, color: "#64748b" },
  hint: { fontSize: 13, color: "#f59e0b", marginTop: -8, marginBottom: 12 },
  submitRow: { marginTop: 8, marginBottom: 32 },
});
