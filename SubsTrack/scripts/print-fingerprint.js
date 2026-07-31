// Prints only the runtime fingerprint hash — the compatibility label EAS Update
// matches installed builds against. Compare it with the fingerprint `eas update`
// reports whenever a published update never arrives. See gotcha #53.
// Usage: node scripts/print-fingerprint.js [android|ios ...]  (default: android)
const { createProjectHashAsync } = require("@expo/fingerprint");

const platforms = process.argv.slice(2);

// npm runs scripts from the package root.
createProjectHashAsync(process.cwd(), {
  platforms: platforms.length ? platforms : ["android"],
})
  .then((hash) => console.log(hash))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
