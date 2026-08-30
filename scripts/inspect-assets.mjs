import fs from "node:fs/promises";

const db = JSON.parse(await fs.readFile("/app/data/auth.json", "utf8"));
const users = Array.isArray(db.users) ? db.users : [];
const assets = Array.isArray(db.assets) ? db.assets : [];
const byId = new Map(users.map((u) => [u.id, u.username || u.email]));

for (const target of process.argv.slice(2)) {
  const user = users.find((u) => (u.username || u.email) === target);
  if (!user) {
    console.log(`user ${target} not found`);
    continue;
  }
  const list = assets.filter((a) => a.userId === user.id);
  console.log(`\n=== ${target} assets: ${list.length}`);
  for (const a of list) {
    console.log(`${a.kind} ${a.id} | created=${new Date(a.createdAt || 0).toISOString()} | prompt=${String(a.prompt || "").slice(0, 80)}`);
  }
}
