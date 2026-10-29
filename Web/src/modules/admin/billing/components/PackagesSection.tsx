import { useTranslation } from "react-i18next";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import WhatsApp from "@mui/icons-material/WhatsApp";
import { formatMoney } from "@shared/core/utils/currency";
import { useBillingContact } from "@shared/modules/admin/billing/hooks/useBillingContact";
import { usePricePackages } from "@shared/modules/admin/billing/hooks/usePricePackages";
import { MAX_SELF_SERVE_PLANS } from "@shared/modules/admin/billing/utils/types";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";
import { SettingsSection } from "@/modules/admin/tenant-settings/components/SettingsSection";

// Hidden without a support number: every package is asked for on WhatsApp.
export function PackagesSection() {
  const { t } = useTranslation();
  const packages = usePricePackages();
  const { canContact, askPackage } = useBillingContact(openWhatsAppAfterSave);

  if (!canContact) return null;

  return (
    <SettingsSection
      title={t("billing.packages_title")}
      hint={t("billing.packages_hint", { max: MAX_SELF_SERVE_PLANS })}
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {packages.map((pkg) => (
          <Card
            key={pkg.size}
            variant="outlined"
            sx={{ flex: 1, borderColor: pkg.current ? "primary.main" : undefined }}
          >
            <CardActionArea
              disabled={pkg.current}
              onClick={() => askPackage(pkg)}
              sx={{ height: "100%" }}
            >
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {t("billing.current_limits_value", {
                      customers: pkg.size,
                      plans: pkg.size,
                    })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {pkg.priceUsd == null
                      ? t("billing.package_ask_price")
                      : t("billing.package_price", {
                          price: formatMoney(pkg.priceUsd, null, null),
                        })}
                  </Typography>
                  {pkg.current ? (
                    <Chip
                      label={t("billing.package_current")}
                      color="primary"
                      size="small"
                      sx={{ alignSelf: "flex-start" }}
                    />
                  ) : (
                    <WhatsApp color="success" fontSize="small" />
                  )}
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </SettingsSection>
  );
}
