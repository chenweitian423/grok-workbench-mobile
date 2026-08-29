import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("Usage: npm run version:set -- 1.2.3");
  process.exit(1);
}

const root = process.cwd();
const packageFiles = [
  "package.json",
  "packages/core/package.json",
  "apps/web/package.json",
  "apps/mobile/package.json"
];

for (const file of packageFiles) {
  const fullPath = path.join(root, file);
  const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  json.version = version;
  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`);
}

const lockPath = path.join(root, "package-lock.json");
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = version;
  const workspacePaths = ["", "packages/core", "apps/web", "apps/mobile"];
  for (const workspacePath of workspacePaths) {
    if (lock.packages?.[workspacePath]) lock.packages[workspacePath].version = version;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

const appJsonPath = path.join(root, "apps/mobile/app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const versionCode = version.split(".").reduce((total, part, index) => total + Number(part) * [10000, 100, 1][index], 0);
appJson.expo.version = version;
appJson.expo.ios.buildNumber = version;
appJson.expo.android.versionCode = versionCode;
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

const corePath = path.join(root, "packages/core/src/index.js");
const coreSource = fs.readFileSync(corePath, "utf8").replace(/export const APP_VERSION = ".*?";/, `export const APP_VERSION = "${version}";`);
fs.writeFileSync(corePath, coreSource);

console.log(`Version set to ${version}`);
