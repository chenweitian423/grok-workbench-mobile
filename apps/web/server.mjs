import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 80);
const root = join(process.cwd(), "dist");
const sub2Target = normalizeTarget(process.env.SUB2_TARGET || "http://host.docker.internal:39080");
const grokTarget = normalizeTarget(process.env.GROK_MEDIA_TARGET || "http://host.docker.internal:38695");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname.startsWith("/sub2/")) {
      await proxy(req, res, sub2Target, url.pathname.replace(/^\/sub2/, "") + url.search);
      return;
    }
    if (url.pathname.startsWith("/grok-media/")) {
      await proxy(req, res, grokTarget, url.pathname.replace(/^\/grok-media/, "") + url.search);
      return;
    }
    await serveStatic(url.pathname, res);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Grok Workbench Web listening on ${port}`);
});

async function proxy(req, res, target, path) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || isHopByHopHeader(key)) continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  headers.set("host", new URL(target).host);

  const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await readRequestBody(req);
  const response = await fetch(`${target}${path}`, {
    method: req.method,
    headers,
    body,
    redirect: "manual"
  });

  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    if (!isHopByHopHeader(key)) responseHeaders[key] = value;
  });
  responseHeaders["access-control-allow-origin"] = "*";

  res.writeHead(response.status, responseHeaders);
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

async function serveStatic(pathname, res) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const requested = join(root, safePath === "/" ? "index.html" : safePath);
  const filePath = existsSync(requested) && statSync(requested).isFile() ? requested : join(root, "index.html");
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": mimeTypes[ext] || "application/octet-stream",
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(res);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function normalizeTarget(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isHopByHopHeader(key) {
  return [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
  ].includes(key.toLowerCase());
}
