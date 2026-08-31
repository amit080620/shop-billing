// Runs automatically before every `npm run build` (wired via
// package.json's "prebuild" script). Stamps public/sw.js with a
// fresh, build-unique cache version every single time — this is the
// permanent fix for the "stale service-worker cache serves mismatched
// JS chunks across deploys" class of bug: it's no longer a manual
// step a developer can forget, it just always happens.
const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "..", "public", "sw.js");
const buildVersion = `v${Date.now()}`;

let content = fs.readFileSync(swPath, "utf8");
content = content.replace(/const SHELL_CACHE = "shop-billing-shell-v[^"]*";/, `const SHELL_CACHE = "shop-billing-shell-${buildVersion}";`);
content = content.replace(/const ASSET_CACHE = "shop-billing-assets-v[^"]*";/, `const ASSET_CACHE = "shop-billing-assets-${buildVersion}";`);
fs.writeFileSync(swPath, content);

console.log(`[sw-version] Stamped service worker with cache version ${buildVersion}`);
