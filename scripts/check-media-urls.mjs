import fs from "node:fs/promises";

const db = JSON.parse(await fs.readFile("/app/data/auth.json", "utf8"));
const assets = Array.isArray(db.assets) ? db.assets : [];
const users = Array.isArray(db.users) ? db.users : [];
const user = users.find((u) => (u.username || u.email) === "sky");
const ids = assets.filter((a) => a.userId === user.id).map((a) => a.id);

const base = "http://127.0.0.1:8000";
let broken = 0;
let ok = 0;
for (const id of ids) {
  const kind = id.startsWith("vid_") ? "videos" : "images";
  const response = await fetch(`${base}/v1/media/${kind}/${id}`);
  const status = response.status;
  if (status === 200 || status === 206) {
    ok += 1;
  } else {
    broken += 1;
    console.log(`BROKEN ${status} ${kind} ${id}`);
  }
}
console.log(`checked=${ids.length} ok=${ok} broken=${broken}`);
