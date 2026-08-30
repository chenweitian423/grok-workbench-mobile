import fs from "node:fs/promises";
import path from "node:path";

const authDbPath = "/app/data/auth.json";
const base = "http://127.0.0.1:80";
const username = process.env.TARGET_USER || "sky";

const db = JSON.parse(await fs.readFile(authDbPath, "utf8"));
const users = Array.isArray(db.users) ? db.users : [];
const sessions = Array.isArray(db.sessions) ? db.sessions : [];
const user = users.find((u) => (u.username || u.email) === username);
if (!user) {
  console.log(`user ${username} not found`);
  process.exit(1);
}
const valid = sessions
  .filter((s) => s.userId === user.id && (!s.expiresAt || s.expiresAt > Date.now()))
  .sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
if (!valid.length) {
  console.log(`no valid session for ${username}`);
  process.exit(1);
}
const token = valid[0].token;

async function fetchLibrary(kind) {
  const response = await fetch(`${base}/library?kind=${kind}&limit=200`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractWorkbenchLibraryItems(data, grokBaseUrl, kind) {
  const list = data?.data || data?.items || (Array.isArray(data) ? data : []);
  if (!Array.isArray(list)) return [];
  const origin = cleanBaseUrl(grokBaseUrl);
  const output = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "");
    if (!/^(img|vid)_[A-Za-z0-9._-]+$/.test(id)) continue;
    const itemKind = kind === "video" ? "video" : "image";
    output.push({
      id,
      url: `${origin}/v1/media/${itemKind === "video" ? "videos" : "images"}/${encodeURIComponent(id)}`,
      kind: itemKind,
      mime: item.mime || (itemKind === "video" ? "video/mp4" : "image/jpeg"),
      prompt: item.prompt || "",
      model: item.model || "",
      createdAt: new Date(item.createdAt || item.updatedAt || Date.now()).getTime()
    });
  }
  return output;
}

function repairGalleryItem(item, baseUrl) {
  if (!item || typeof item !== "object") return null;
  const origin = cleanBaseUrl(baseUrl);
  const kind = item.kind === "video" ? "video" : "image";
  const id = String(item.id || item.assetId || item.asset_id || "");
  let url = String(item.url || "");
  if (/^(img|vid)_[A-Za-z0-9._-]+$/.test(id)) {
    url = `${origin}/v1/media/${kind === "video" ? "videos" : "images"}/${encodeURIComponent(id)}`;
  } else {
    url = (() => {
      const raw = String(item.url || "");
      if (!raw) return "";
      if (raw.startsWith("data:")) return raw;
      if (/^https?:\/\//i.test(raw)) {
        const pathMatch = raw.match(/^https?:\/\/[^/]+(\/.*)$/i);
        const path = pathMatch ? pathMatch[1] : raw;
        if (/127\.0\.0\.1|localhost|host\.docker\.internal|0\.0\.0\.0/i.test(raw)) return `${origin}${path}`;
        return raw;
      }
      if (raw.startsWith("/")) return `${origin}${raw}`;
      return raw;
    })();
    const assetMatch = url.match(/(?:^|\/)((?:img|vid)_[A-Za-z0-9._-]+)(?:$|\?)/);
    if (assetMatch) {
      url = `${origin}/v1/media/${kind === "video" ? "videos" : "images"}/${assetMatch[1]}`;
    }
  }
  if (!url) return null;
  return { ...item, id: id || url, url, kind };
}

const grokBase = "https://grok.sky423.cn:18888";
const imageData = (await fetchLibrary("image")).data;
const videoData = (await fetchLibrary("video")).data;
const serverItems = [
  ...extractWorkbenchLibraryItems(imageData, grokBase, "image"),
  ...extractWorkbenchLibraryItems(videoData, grokBase, "video")
];
console.log(`\nserverItems=${serverItems.length} (image=${serverItems.filter((i) => i.kind === "image").length}, video=${serverItems.filter((i) => i.kind === "video").length})`);
const repaired = serverItems.map((item) => repairGalleryItem(item, grokBase)).filter(Boolean);
console.log(`after repair=${repaired.length} (image=${repaired.filter((i) => i.kind === "image").length}, video=${repaired.filter((i) => i.kind === "video").length})`);
const dupUrls = repaired.length - new Set(repaired.map((i) => i.url)).size;
const dupIds = repaired.length - new Set(repaired.map((i) => String(i.id))).size;
console.log(`duplicate urls=${dupUrls}, duplicate ids=${dupIds}`);
