import fs from "node:fs/promises";
import path from "node:path";

const mediaRoot = process.env.MEDIA_ROOT || "/grok2api-data/media";
const authDbPath = process.env.APP_DATA_ROOT ? path.join(process.env.APP_DATA_ROOT, "auth.json") : "/app/data/auth.json";

const mediaFolders = {
  image: { dir: "images/im", extensions: [".jpg", ".jpeg", ".png", ".webp"] },
  video: { dir: "videos/vi", extensions: [".mp4"] }
};

async function findAssetFile(assetId) {
  if (!/^(img|vid)_[A-Za-z0-9._-]+$/.test(assetId)) return null;
  const isVideo = assetId.startsWith("vid_");
  const folder = isVideo ? "videos/vi" : "images/im";
  const extensions = isVideo ? [".mp4"] : [".jpg", ".jpeg", ".png", ".webp"];
  for (const extension of extensions) {
    const candidate = path.resolve(mediaRoot, folder, `${assetId}${extension}`);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return { filePath: candidate };
    } catch {}
  }
  return null;
}

const text = await fs.readFile(authDbPath, "utf8");
const db = JSON.parse(text);
const assets = Array.isArray(db.assets) ? db.assets : [];
const users = Array.isArray(db.users) ? db.users : [];

for (const user of users) {
  for (const kind of ["image", "video"]) {
    const owned = assets.filter((asset) => asset.userId === user.id && asset.kind === kind);
    const returned = [];
    const missing = [];
    for (const asset of owned) {
      const found = await findAssetFile(asset.id);
      if (!found) {
        missing.push(asset.id);
        continue;
      }
      const ext = path.extname(found.filePath).toLowerCase();
      if (!mediaFolders[kind].extensions.includes(ext)) {
        missing.push(`${asset.id} (ext ${ext})`);
        continue;
      }
      returned.push(asset.id);
    }
    console.log(`${user.username || user.email || user.id} | ${kind} | db=${owned.length} returned=${returned.length} missing=${missing.length}`);
    if (missing.length) console.log(`    missing: ${missing.join(", ")}`);
  }
}

// Also report assets that exist in db but whose kind contradicts the id prefix.
for (const asset of assets) {
  const expected = asset.id?.startsWith("vid_") ? "video" : "image";
  if (asset.kind !== expected) {
    console.log(`kind mismatch: ${asset.id} kind=${asset.kind} expected=${expected} user=${asset.userId}`);
  }
}
