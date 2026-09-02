const path = require('path');

const app = path.resolve(__dirname, '../SubsTrack');
const stub = (name) => path.resolve(__dirname, 'stubs', name);

/**
 * The app graph reaches a native module from almost every file (react-native's
 * Platform switch, expo-crypto's ids, the Supabase client). Each is mapped to a
 * tiny stub below. Nothing here fakes a money RULE — only the platform under one.
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/suites/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    // Ordered: the specific entries must win over the generic `@/` alias.
    '^@/src/core/i18n$': stub('i18n.ts'),
    // The real client imports react-native-url-polyfill, AppState and
    // AsyncStorage at module load — cut the chain here, not one link at a time.
    '^@/src/shared/lib/supabase$': stub('supabase-client.ts'),
    // These two barrels export SCREENS next to their mappers, so importing one
    // pulls React + NativeWind + expo-router into a service test. The stubs
    // re-export the same non-UI members from their deep paths.
    '^@/src/modules/admin/products$': stub('products-barrel.ts'),
    '^@/src/modules/customer/customers$': stub('customers-barrel.ts'),
    '^@/src/modules/customer/customer-plans$': stub('customer-plans-barrel.ts'),
    '^@/(.*)$': `${app}/$1`,
    '^react-native-url-polyfill/auto$': stub('empty.ts'),
    '^react-native$': stub('react-native.ts'),
    '^expo-crypto$': stub('expo-crypto.ts'),
    '^expo-sqlite$': stub('expo-sqlite.ts'),
    '^expo-localization$': stub('empty.ts'),
    '^expo-updates$': stub('empty.ts'),
    '^@supabase/supabase-js$': stub('supabase.ts'),
    '^@react-native-async-storage/async-storage$': stub('empty.ts'),
    '^@react-native-community/netinfo$': stub('netinfo.ts'),
  },
  collectCoverageFrom: [
    `${app}/src/modules/ledger/**/*.ts`,
    `${app}/src/modules/customer/customer-payments/**/*.ts`,
    `${app}/src/modules/customer/customer-plans/utils/*.ts`,
    `${app}/src/modules/transaction/sales/**/*.ts`,
    `${app}/src/modules/wallet/utils/*.ts`,
    `${app}/src/core/utils/*.ts`,
    '!**/*.tsx',
  ],
};
