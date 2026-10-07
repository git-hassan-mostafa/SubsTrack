import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ToggleOnOutlined from "@mui/icons-material/ToggleOnOutlined";
import type { Customer } from "@shared/core/types";
import { isolate } from "@shared/core/utils/bidi";
import { locationHref } from "@shared/core/utils/locationLink";
import { buildPortalLink } from "@shared/core/utils/portalLink";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { useCustomerPortalUrl } from "@shared/state/hooks/useOptionSlice";
import { InfoRows } from "@/shared/components/InfoRows";
import { PanelSection } from "@/shared/components/PanelSection";
import { StatusChip } from "@/shared/components/StatusChip";
import { useCopyText } from "@/shared/hooks/useCopyText";

// The portal link shows only while the portal is on: a dead link is worse than none.
export function CustomerDetailsPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const branchName = useBranchSlice((s) => s.items.find((b) => b.id === customer.branchId)?.name ?? null);
  const portalBaseUrl = useCustomerPortalUrl();
  const { copied, copy } = useCopyText();
  const portalLink = customer.portalEnabled ? buildPortalLink(portalBaseUrl, customer.id) : null;
  const mapsHref = locationHref(customer.locationUrl);

  return (
    <PanelSection title={t("customers.details_section")}>
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <InfoRows
          rows={[
            { label: t("customers.phone_label"), value: isolate(customer.phoneNumber ?? ""), icon: PhoneOutlined },
            { label: t("branches.branch_label"), value: branchName, icon: AccountTreeOutlined },
            { label: t("customers.address_label"), value: customer.address, icon: HomeOutlined },
            { label: t("customers.area_label"), value: customer.area, icon: MapOutlined },
            {
              label: t("customers.location_label"),
              icon: PlaceOutlined,
              value: mapsHref ? (
                <Link
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 600 }}
                >
                  {t("customers.location_open")}
                  <OpenInNewOutlined sx={{ fontSize: 16 }} aria-hidden />
                </Link>
              ) : null,
            },
            {
              label: t("customers.portal_link_label"),
              icon: LanguageOutlined,
              value: portalLink ? (
                <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                  <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                    {isolate(portalLink)}
                  </Typography>
                  <Button
                    size="small"
                    color={copied ? "success" : "primary"}
                    startIcon={copied ? <CheckCircleOutlined /> : <ContentCopyOutlined />}
                    onClick={() => void copy(portalLink)}
                  >
                    {copied ? t("customers.portal_copied") : t("customers.portal_copy_link")}
                  </Button>
                </Stack>
              ) : null,
            },
            { label: t("customers.notes_label"), value: customer.notes, icon: NotesOutlined },
            {
              label: t("customers.status_label"),
              icon: ToggleOnOutlined,
              value: (
                <StatusChip
                  label={customer.active ? t("common.active") : t("common.inactive")}
                  tone={customer.active ? "emerald" : "orange"}
                />
              ),
            },
          ]}
        />
      </Paper>
    </PanelSection>
  );
}
