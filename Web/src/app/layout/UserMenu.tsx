import { useId, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import Check from "@mui/icons-material/Check";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@shared/core/i18n";
import { isolate } from "@shared/core/utils/bidi";
import { roleLabelKey } from "@shared/modules/admin/users/utils/userRules";
import { confirm } from "@shared/shared/lib/confirm";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { endWebSession } from "@/state/webSession";
import { currentLanguage } from "@/core/i18n/language";
import { switchLanguage } from "@/core/i18n/setup";
import { flipInRtl } from "@/app/theme/flipInRtl";

export function UserMenu() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const theme = useTheme();
  const user = useAuthSlice((s) => s.user);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const buttonId = useId();
  const menuId = useId();

  if (!user) return null;

  const close = () => setAnchor(null);
  const language = currentLanguage(i18n.language);
  const menuEdge = theme.direction === "rtl" ? "left" : "right";

  const pickLanguage = (next: SupportedLanguage) => {
    close();
    if (next !== language) void switchLanguage(next);
  };

  const openMyWallet = () => {
    close();
    navigate("/my-wallet");
  };

  const logOut = async () => {
    close();
    await confirm({
      title: t("settings.logout"),
      message: t("settings.logout_confirm"),
      confirmLabel: t("settings.logout"),
      destructive: true,
      onConfirm: endWebSession,
    });
  };

  const branchName = user.branchId
    ? (user.branch?.name ?? "")
    : t("branches.tenant_wide_admin");

  return (
    <>
      <Button
        id={buttonId}
        color="inherit"
        aria-label={user.fullName}
        aria-controls={anchor ? menuId : undefined}
        aria-haspopup="true"
        aria-expanded={anchor ? "true" : undefined}
        onClick={(event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)}
        startIcon={<AccountCircleOutlined />}
        endIcon={<ExpandMore />}
        sx={{ maxWidth: 240 }}
      >
        <Box
          component="span"
          sx={{
            display: { xs: "none", sm: "inline" },
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.fullName}
        </Box>
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: menuEdge }}
        transformOrigin={{ vertical: "top", horizontal: menuEdge }}
        slotProps={{ list: { "aria-labelledby": buttonId } }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1.5, maxWidth: 300 }}>
          <Typography sx={{ fontWeight: 700 }}>{user.fullName}</Typography>
          <Typography variant="body2" color="text.secondary">
            {isolate(`@${user.username}`)} · {t(roleLabelKey(user.role))}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.tenant.name} · {branchName}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={openMyWallet}>
          <ListItemIcon>
            <AccountBalanceWalletOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("wallet.my_title")}</ListItemText>
        </MenuItem>
        <Divider />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, pt: 0.5 }}>
          {t("settings.language_section")}
        </Typography>
        {SUPPORTED_LANGUAGES.map((option) => (
          <MenuItem key={option} selected={option === language} onClick={() => pickLanguage(option)}>
            <ListItemIcon>{option === language ? <Check fontSize="small" /> : null}</ListItemIcon>
            <ListItemText lang={option}>{LANGUAGE_NAMES[option]}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => void logOut()} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <LogoutOutlined fontSize="small" color="error" sx={flipInRtl} />
          </ListItemIcon>
          <ListItemText>{t("settings.logout")}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
