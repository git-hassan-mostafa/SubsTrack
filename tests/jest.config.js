const path = require("path");

const app = path.resolve(__dirname, "../SubsTrack");
const shared = path.resolve(__dirname, "../Shared");
const stub = (name) => path.resolve(__dirname, "stubs", name);

// Native edges map to tiny stubs; a stub fakes the platform, never a money rule.
module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  testMatch: ["<rootDir>/suites/**/*.test.ts"],
  setupFiles: ["<rootDir>/helpers/configureRuntime.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^@shared/core/i18n$": stub("i18n.ts"),
    "^@/src/shared/lib/supabase$": stub("supabase-client.ts"),
    "^@shared/(.*)$": `${shared}/src/$1`,
    "^@edge/(.*)$": `${app}/supabase/functions/_shared/$1`,
    "^@/(.*)$": `${app}/$1`,
    "^expo-crypto$": stub("expo-crypto.ts"),
    "^@react-native-community/netinfo$": stub("netinfo.ts"),
  },
  collectCoverageFrom: [
    `${app}/src/modules/ledger/**/*.ts`,
    `${app}/src/modules/customer/customer-payments/**/*.ts`,
    `${app}/src/modules/transaction/sales/**/*.ts`,
    `${shared}/src/modules/ledger/**/*.ts`,
    `${shared}/src/modules/customer/customer-payments/**/*.ts`,
    `${shared}/src/modules/customer/customer-plans/utils/*.ts`,
    `${shared}/src/modules/customer/customers/utils/*.ts`,
    `${shared}/src/modules/transaction/sales/**/*.ts`,
    `${shared}/src/modules/wallet/utils/*.ts`,
    `${shared}/src/core/utils/*.ts`,
    "!**/*.tsx",
  ],
};
