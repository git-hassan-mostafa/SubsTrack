import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { isolate } from "@shared/core/utils/bidi";
import { buildPortalLink } from "@shared/core/utils/portalLink";
import {
  generatePortalPassword,
  portalPasswordOnEnable,
} from "@shared/core/utils/portalPassword";
import { copyText } from "@/shared/lib/copyText";

const COPIED_MS = 2000;

interface PortalAccessFieldProps {
  customerId: string | null;
  portalBaseUrl: string | null;
  enabled: boolean;
  password: string;
  onChange: (next: { portalEnabled?: boolean; portalPassword?: string }) => void;
}

// Hidden until the SaaS owner sets CustomerPortalUrl: no base URL, no link.
export function PortalAccessField({
  customerId,
  portalBaseUrl,
  enabled,
  password,
  onChange,
}: PortalAccessFieldProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!portalBaseUrl?.trim()) return null;
  const link = customerId ? buildPortalLink(portalBaseUrl, customerId) : null;

  const toggle = (next: boolean) => {
    const filled = next ? portalPasswordOnEnable(password) : password;
    if (filled !== password) setRevealed(true);
    onChange({ portalEnabled: next, portalPassword: filled });
  };

  const copyLink = async () => {
    if (link && (await copyText(link))) setCopied(true);
  };

  const revealLabel = revealed ? t("web.hide_password") : t("web.show_password");

  return (
    <Stack spacing={2}>
      <FormControlLabel
        sx={{ alignItems: "flex-start", mx: 0, justifyContent: "space-between" }}
        labelPlacement="start"
        control={<Switch checked={enabled} onChange={(event) => toggle(event.target.checked)} />}
        label={
          <span>
            <Typography sx={{ fontWeight: 600 }}>{t("customers.portal_label")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("customers.portal_hint")}
            </Typography>
          </span>
        }
      />
      {enabled ? (
        <>
          <TextField
            label={t("customers.portal_password_label")}
            required
            type={revealed ? "text" : "password"}
            value={password}
            onChange={(event) => onChange({ portalPassword: event.target.value })}
            placeholder={t("customers.portal_password_placeholder")}
            helperText={t("customers.portal_password_generated_hint")}
            fullWidth
            slotProps={{
              htmlInput: { autoCapitalize: "none", autoComplete: "off", spellCheck: false },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={t("web.customers.new_portal_password")}>
                      <IconButton
                        aria-label={t("web.customers.new_portal_password")}
                        onClick={() => {
                          onChange({ portalPassword: generatePortalPassword() });
                          setRevealed(true);
                        }}
                      >
                        <RefreshOutlined />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={revealLabel}>
                      <IconButton aria-label={revealLabel} onClick={() => setRevealed((prev) => !prev)}>
                        {revealed ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          {link ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {t("customers.portal_link_label")}
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-all", my: 1 }}>
                {isolate(link)}
              </Typography>
              <Button
                size="small"
                color={copied ? "success" : "primary"}
                startIcon={copied ? <CheckCircleOutlined /> : <ContentCopyOutlined />}
                onClick={() => void copyLink()}
              >
                {copied ? t("customers.portal_copied") : t("customers.portal_copy_link")}
              </Button>
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t("customers.portal_link_after_save")}
            </Typography>
          )}
        </>
      ) : null}
    </Stack>
  );
}
