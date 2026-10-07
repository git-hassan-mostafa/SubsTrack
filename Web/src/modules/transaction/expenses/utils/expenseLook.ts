import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import DirectionsCarOutlined from "@mui/icons-material/DirectionsCarOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import LaptopOutlined from "@mui/icons-material/LaptopOutlined";
import LocalGasStationOutlined from "@mui/icons-material/LocalGasStationOutlined";
import MemoryOutlined from "@mui/icons-material/MemoryOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import PeopleOutlined from "@mui/icons-material/PeopleOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import PhoneIphoneOutlined from "@mui/icons-material/PhoneIphoneOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import VolunteerActivismOutlined from "@mui/icons-material/VolunteerActivismOutlined";
import WorkOutlined from "@mui/icons-material/WorkOutlined";
import type { ExpenseCategory } from "@shared/core/types";
import type { ExpenseActionKey } from "@shared/modules/transaction/expenses/utils/expenseList";

export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, SvgIconComponent> = {
  rent: BusinessOutlined,
  salaries: PeopleOutlined,
  utilities: BoltOutlined,
  fuel: LocalGasStationOutlined,
  transport: DirectionsCarOutlined,
  maintenance: BuildOutlined,
  spare_parts: SettingsOutlined,
  equipment: MemoryOutlined,
  supplies: ShoppingBagOutlined,
  internet: LanguageOutlined,
  phone: PhoneIphoneOutlined,
  software: LaptopOutlined,
  commissions: PercentOutlined,
  taxes: DescriptionOutlined,
  bank_fees: AccountBalanceOutlined,
  insurance: VerifiedUserOutlined,
  professional_fees: WorkOutlined,
  marketing: CampaignOutlined,
  meals: RestaurantOutlined,
  cleaning: CleaningServicesOutlined,
  donations: VolunteerActivismOutlined,
  other: MoreHorizOutlined,
  stock: Inventory2Outlined,
};

export const EXPENSE_ACTION_ICONS: Record<ExpenseActionKey, SvgIconComponent> = {
  product: Inventory2Outlined,
  remove: DeleteOutlined,
};
