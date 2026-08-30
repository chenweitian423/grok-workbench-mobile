import http from "node:http";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 80);
const grok2apiUrl = (process.env.GROK2API_URL || "http://127.0.0.1:38695").replace(/\/+$/, "");
const mediaRoot = process.env.MEDIA_ROOT || "/grok2api-data/media";
const dataRoot = process.env.APP_DATA_ROOT || "/app/data";
const authDbPath = path.join(dataRoot, "auth.json");
const sessionMaxAge = 60 * 60 * 24 * 30;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".mp4": "video/mp4"
};

const mediaFolders = {
  image: {
    dir: "images/im",
    mime: "image/jpeg",
    extensions: new Set([".jpg", ".jpeg", ".png", ".webp"])
  },
  video: {
    dir: "videos/vi",
    mime: "video/mp4",
    extensions: new Set([".mp4"])
  }
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function readAuthDb() {
  try {
    const text = await fs.readFile(authDbPath, "utf8");
    const data = JSON.parse(text);
    return {
      users: Array.isArray(data.users) ? data.users : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      assets: Array.isArray(data.assets) ? data.assets : []
    };
  } catch {
    return { users: [], sessions: [], assets: [] };
  }
}

async function writeAuthDb(data) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(authDbPath, JSON.stringify(data, null, 2), "utf8");
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf("=");
      return index >= 0 ? [item.slice(0, index), decodeURIComponent(item.slice(index + 1))] : [item, ""];
    }));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = hashPassword(password, salt).split(":")[1];
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(next, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function publicUser(user) {
  return user ? { id: user.id, username: user.username } : null;
}

async function getSessionUser(req) {
  const token = getRequestToken(req) || parseCookies(req).gw_session;
  if (!token) return null;
  const db = await readAuthDb();
  const now = Date.now();
  const session = db.sessions.find((item) => item.token === token && item.expiresAt > now);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? { user, db, token } : null;
}

function getRequestToken(req) {
  const header = String(req.headers.authorization || req.headers["x-gw-token"] || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : header).trim() || null;
}

async function requireUser(req, res) {
  const session = await getSessionUser(req);
  if (session) return session;
  sendJson(res, 401, { error: { message: "请先登录" } });
  return null;
}

function sessionCookie(token, maxAge = sessionMaxAge) {
  return `gw_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function handleAuth(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/auth/me") {
    const session = await getSessionUser(req);
    sendJson(res, 200, { user: publicUser(session?.user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const token = getRequestToken(req) || parseCookies(req).gw_session;
    const db = await readAuthDb();
    db.sessions = db.sessions.filter((item) => item.token !== token);
    await writeAuthDb(db);
    sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    return;
  }

  if (req.method !== "POST" || !["/auth/login", "/auth/register"].includes(url.pathname)) {
    sendJson(res, 404, { error: { message: "Not found" } });
    return;
  }

  const body = await readBodyJson(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[a-z0-9_\-.@]{3,40}$/.test(username) || password.length < 6) {
    sendJson(res, 400, { error: { message: "用户名至少 3 位，密码至少 6 位" } });
    return;
  }

  const db = await readAuthDb();
  let user = db.users.find((item) => item.username === username);
  if (url.pathname === "/auth/register") {
    if (user) {
      sendJson(res, 409, { error: { message: "用户名已存在" } });
      return;
    }
    user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: hashPassword(password),
      createdAt: Date.now()
    };
    db.users.push(user);
  } else if (!user || !verifyPassword(password, user.passwordHash)) {
    sendJson(res, 401, { error: { message: "用户名或密码错误" } });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  db.sessions = db.sessions.filter((item) => item.expiresAt > Date.now());
  db.sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + sessionMaxAge * 1000 });
  await writeAuthDb(db);
  sendJson(res, 200, { user: publicUser(user), token }, { "Set-Cookie": sessionCookie(token) });
}

function extractAssetIds(data) {
  const items = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      for (const key of ["id", "asset_id", "assetId", "result_asset_id", "resultAssetId"]) {
        const raw = String(value[key] || "");
        const match = raw.match(/^(img|vid)_[A-Za-z0-9._-]+$/) || raw.match(/(?:^|[/?])((?:img|vid)_[A-Za-z0-9._-]+)/);
        if (match) items.push(match[1] || match[0]);
      }
      for (const key of ["url", "asset_url", "video_url", "image_url", "download_url", "media_url", "mediaUrl"]) {
        const match = String(value[key] || "").match(/(img|vid)_[A-Za-z0-9._-]+/);
        if (match) items.push(match[0]);
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(data);
  return Array.from(new Set(items));
}

function kindFromAssetId(id) {
  return String(id || "").startsWith("vid_") ? "video" : "image";
}

async function recordAssetsForUser(userId, ids, meta = {}) {
  const validIds = Array.from(new Set((ids || []).filter((id) => /^(img|vid)_[A-Za-z0-9._-]+$/.test(id))));
  if (!userId || !validIds.length) return;
  const withFiles = [];
  for (const id of validIds) {
    if (await findAssetFile(id)) withFiles.push(id);
  }
  if (!withFiles.length) return;
  const db = await readAuthDb();
  const existing = new Map(db.assets.map((asset) => [`${asset.userId}:${asset.id}`, asset]));
  for (const id of withFiles) {
    const key = `${userId}:${id}`;
    const previous = existing.get(key);
    const next = {
      ...(previous || {}),
      id,
      userId,
      kind: meta.kind || kindFromAssetId(id),
      prompt: meta.prompt || previous?.prompt || "",
      model: meta.model || previous?.model || "",
      createdAt: previous?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    if (previous) Object.assign(previous, next);
    else db.assets.push(next);
  }
  await writeAuthDb(db);
}

async function findRecentUnclaimedAssetIds(kind, since = 0, limit = 5) {
  const config = mediaFolders[kind];
  if (!config) return [];
  const db = await readAuthDb();
  const claimed = new Set(db.assets.map((asset) => asset.id));
  const folder = path.resolve(mediaRoot, config.dir);
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!config.extensions.has(ext)) continue;
    const id = path.basename(entry.name, ext);
    if (!/^(img|vid)_[A-Za-z0-9._-]+$/.test(id) || claimed.has(id)) continue;
    const filePath = path.join(folder, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) continue;
    const changedAt = Math.max(stat.birthtimeMs || 0, stat.mtimeMs || 0, stat.ctimeMs || 0);
    if (since && changedAt < since) continue;
    items.push({ id, changedAt });
  }
  return items
    .sort((a, b) => b.changedAt - a.changedAt)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)))
    .map((item) => item.id);
}

async function claimAssets(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  const body = await readBodyJson(req);
  const ids = extractAssetIds(body);
  await recordAssetsForUser(session.user.id, ids, {
    kind: body.kind,
    prompt: String(body.prompt || ""),
    model: String(body.model || "")
  });
  sendJson(res, 200, { ok: true, count: ids.length });
}

async function claimRecentAssets(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  const body = await readBodyJson(req);
  const kind = body.kind === "video" ? "video" : "image";
  const since = Math.max(0, Number(body.since) || Date.now() - 6 * 60 * 60 * 1000);
  const ids = await findRecentUnclaimedAssetIds(kind, since, body.limit || 3);
  await recordAssetsForUser(session.user.id, ids, {
    kind,
    prompt: String(body.prompt || ""),
    model: String(body.model || "")
  });
  sendJson(res, 200, { ok: true, count: ids.length, ids });
}

async function proxyApi(req, res) {
  const session = await getSessionUser(req);
  const requestUrl = new URL(req.url, "http://localhost");
  const targetPath = requestUrl.pathname.replace(/^\/api/, "") || "/";
  const targetSearch = requestUrl.search;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  let proxyBody = body;

  if (body && req.method === "POST" && targetPath.replace(/\/+$/, "") === "/v1/videos/generations") {
    try {
      const payload = JSON.parse(body.toString("utf8"));
      if (typeof payload.prompt === "string") {
        const beforeChars = payload.prompt.length;
        const beforeBytes = Buffer.byteLength(payload.prompt, "utf8");
        payload.prompt = clampVideoPrompt(payload.prompt);
        console.info("video_prompt_clamped", {
          beforeChars,
          beforeBytes,
          afterChars: payload.prompt.length,
          afterBytes: Buffer.byteLength(payload.prompt, "utf8")
        });
      }
      proxyBody = Buffer.from(JSON.stringify(payload));
      headers["content-length"] = String(proxyBody.length);
    } catch {
      // Keep original payload if parsing fails.
    }
  }

  try {
    const upstream = await fetch(`${grok2apiUrl}${targetPath}${targetSearch}`, {
      method: req.method,
      headers,
      body: proxyBody
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key)) responseHeaders[key] = value;
    });
    if (session?.user && upstream.ok && /\/v1\/(images|videos|media)\//.test(targetPath)) {
      try {
        const data = JSON.parse(responseBody.toString("utf8"));
        const ids = extractAssetIds(data);
        let requestData = {};
        try {
          requestData = body ? JSON.parse(body.toString("utf8")) : {};
        } catch {
          requestData = {};
        }
        await recordAssetsForUser(session.user.id, ids, {
          kind: targetPath.includes("/videos/") ? "video" : "image",
          prompt: String(requestData.prompt || ""),
          model: String(requestData.model || "")
        });
      } catch {
        // Non-JSON media responses are proxied unchanged.
      }
    }
    send(res, upstream.status, responseBody, responseHeaders);
  } catch (error) {
    send(res, 502, JSON.stringify({ error: { message: `无法连接 Grok2API: ${error.message}` } }), {
      "Content-Type": "application/json; charset=utf-8"
    });
  }
}

function clampVideoPrompt(value) {
  const raw = String(value || "").replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const candidates = raw
    .split(/[。！？；;\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const priority = candidates.filter((part) => /主体|人物|动作|镜头|景别|时长|节奏|风格|光线|场景|构图|运镜|情绪|色彩|氛围|视频|prompt|prompt/i.test(part));
  const merged = [...priority, ...candidates].join("，");
  return clampUtf8(merged.slice(0, 1200), 3600);
}

function clampUtf8(value, maxBytes) {
  let bytes = 0;
  let output = "";
  for (const char of String(value || "")) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) break;
    output += char;
    bytes += charBytes;
  }
  return output;
}

async function findAssetFile(assetId) {
  if (!/^(img|vid)_[A-Za-z0-9._-]+$/.test(assetId)) return null;
  const folder = assetId.startsWith("vid_") ? "videos/vi" : "images/im";
  const extensions = assetId.startsWith("vid_") ? [".mp4"] : [".jpg", ".jpeg", ".png", ".webp"];

  for (const extension of extensions) {
    const candidate = path.resolve(mediaRoot, folder, `${assetId}${extension}`);
    if (!candidate.startsWith(path.resolve(mediaRoot))) continue;
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return { filePath: candidate, stat };
    } catch {
      // Try the next known media extension.
    }
  }
  return null;
}

async function serveAsset(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  const url = new URL(req.url, "http://localhost");
  const assetId = decodeURIComponent(url.pathname.replace(/^\/asset\//, ""));
  if (!session.db.assets.some((asset) => asset.userId === session.user.id && asset.id === assetId)) {
    sendJson(res, 403, { error: { message: "无权访问该媒体" } });
    return;
  }
  const found = await findAssetFile(assetId);

  if (!found) {
    send(res, 404, JSON.stringify({ error: { message: "Media asset not found" } }), {
      "Content-Type": "application/json; charset=utf-8"
    });
    return;
  }

  const ext = path.extname(found.filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const filename = `${assetId}${ext}`;
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  const commonHeaders = {
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename="${filename}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400"
  };

  if (req.method === "HEAD") {
    res.writeHead(200, { ...commonHeaders, "Content-Length": found.stat.size });
    res.end();
    return;
  }

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${found.stat.size}` });
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : found.stat.size - 1;
    if (start >= found.stat.size || end >= found.stat.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${found.stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...commonHeaders,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${found.stat.size}`
    });
    createReadStream(found.filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...commonHeaders, "Content-Length": found.stat.size });
  createReadStream(found.filePath).pipe(res);
}

async function serveLibrary(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  const url = new URL(req.url, "http://localhost");
  const kind = url.searchParams.get("kind") === "video" ? "video" : "image";
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 60));
  const config = mediaFolders[kind];
  const directory = path.resolve(mediaRoot, config.dir);

  try {
    const recentIds = await findRecentUnclaimedAssetIds(kind, Date.now() - 6 * 60 * 60 * 1000, 3);
    if (recentIds.length) {
      await recordAssetsForUser(session.user.id, recentIds, { kind });
      session.db = await readAuthDb();
    }
    const owned = session.db.assets
      .filter((asset) => asset.userId === session.user.id && asset.kind === kind)
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    const items = [];
    for (const asset of owned) {
      const found = await findAssetFile(asset.id);
      if (!found) continue;
      const ext = path.extname(found.filePath).toLowerCase();
      if (!config.extensions.has(ext)) continue;
      items.push({
        id: asset.id,
        kind,
        url: `/asset/${encodeURIComponent(asset.id)}`,
        mime: mimeTypes[ext] || config.mime,
        size: found.stat.size,
        prompt: asset.prompt || "",
        model: asset.model || "",
        createdAt: asset.createdAt || Math.max(found.stat.birthtimeMs || 0, found.stat.mtimeMs || 0),
        updatedAt: asset.updatedAt || asset.createdAt || 0,
        name: path.basename(found.filePath)
      });
    }
    items.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    send(res, 200, JSON.stringify({
      data: items.slice(0, limit),
      total: owned.length,
      available: items.length
    }), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache"
    });
  } catch (error) {
    send(res, 500, JSON.stringify({ error: { message: error.message } }), {
      "Content-Type": "application/json; charset=utf-8"
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const requested = path.join(distDir, safePath === "/" ? "index.html" : safePath);
  const filePath = requested.startsWith(distDir) ? requested : path.join(distDir, "index.html");

  try {
    const stat = await fs.stat(filePath);
    const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const ext = path.extname(finalPath).toLowerCase();
    const body = await fs.readFile(finalPath);
    send(res, 200, body, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  } catch {
    const body = await fs.readFile(path.join(distDir, "index.html"));
    send(res, 200, body, { "Content-Type": mimeTypes[".html"] });
  }
}

http.createServer((req, res) => {
  if (req.url?.startsWith("/auth/")) {
    handleAuth(req, res);
    return;
  }
  if (req.url?.startsWith("/ownership/claim")) {
    claimAssets(req, res);
    return;
  }
  if (req.url?.startsWith("/ownership/recent")) {
    claimRecentAssets(req, res);
    return;
  }
  if (req.url?.startsWith("/api/") || req.url === "/api") {
    proxyApi(req, res);
    return;
  }
  if (req.url?.startsWith("/asset/")) {
    serveAsset(req, res);
    return;
  }
  if (req.url?.startsWith("/library")) {
    serveLibrary(req, res);
    return;
  }
  serveStatic(req, res);
}).listen(port, "0.0.0.0", () => {
  console.log(`Grok Workbench listening on ${port}, proxying ${grok2apiUrl}`);
});
