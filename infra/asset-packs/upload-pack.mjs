#!/usr/bin/env node
// Uploads an asset pack (manifest.json + images) through the API's POST /game-assets,
// so files land in MinIO and rows in GameAsset exactly like an admin upload from the UI.
// Usage: node infra/asset-packs/upload-pack.mjs infra/asset-packs/lumi-pastel-01 [apiBase]
// Asks for an account with MANAGE_GAME_ASSETS; the password is read hidden and never printed or stored.
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const packDir = process.argv[2];
const apiBase = process.argv[3] ?? "http://localhost:4000/api/v1";
if (!packDir) {
  console.error("Usage: node infra/asset-packs/upload-pack.mjs <packDir> [apiBase]");
  process.exit(1);
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(text);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const manifest = JSON.parse(await readFile(path.join(packDir, "manifest.json"), "utf8"));
const email = process.env.LUMI_ADMIN_EMAIL || (await ask("Email admin: "));
const password = await ask("Mật khẩu: ", true);

const login = await fetch(`${apiBase}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error(`Đăng nhập thất bại (HTTP ${login.status}).`);
  process.exit(1);
}
const { accessToken } = await login.json();
const auth = { Authorization: `Bearer ${accessToken}` };

// Skip assets already uploaded (same name + assetSet) so the script can be re-run safely.
async function exists(asset) {
  const url = new URL(`${apiBase}/game-assets`);
  url.searchParams.set("search", asset.name);
  url.searchParams.set("pageSize", "100");
  const response = await fetch(url, { headers: auth });
  if (!response.ok) return false;
  const body = await response.json();
  const rows = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
  return rows.some(
    (row) => row.name === asset.name && row.attributes?.assetSet === asset.attributes.assetSet,
  );
}

let uploaded = 0;
for (const asset of manifest.assets) {
  if (await exists(asset)) {
    console.log(`= bỏ qua (đã có): ${asset.name}`);
    continue;
  }
  const bytes = await readFile(path.join(packDir, asset.file));
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/webp" }), path.basename(asset.file));
  form.set("name", asset.name);
  form.set("objectType", asset.objectType);
  form.set("tags", JSON.stringify(asset.tags));
  form.set("attributes", JSON.stringify(asset.attributes));
  const response = await fetch(`${apiBase}/game-assets`, { method: "POST", headers: auth, body: form });
  if (!response.ok) {
    console.error(`✗ ${asset.name}: HTTP ${response.status} ${await response.text()}`);
    continue;
  }
  const row = await response.json();
  uploaded += 1;
  console.log(`+ ${asset.name} → ${row.id}`);
}
console.log(`Xong: tải lên ${uploaded}/${manifest.assets.length}.`);
