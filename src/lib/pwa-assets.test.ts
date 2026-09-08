import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import manifest from "@/app/manifest";

const root = process.cwd();

test("manifest defines installable app identity and icon purposes", () => {
  const data = manifest();
  assert.equal(data.name, "NFL Picks");
  assert.equal(data.display, "standalone");
  assert.equal(data.start_url, "/");
  assert.equal(data.scope, "/");
  assert.ok(data.theme_color);
  assert.ok(data.background_color);
  assert.ok(data.icons?.some((icon) => icon.purpose === "any"));
  assert.ok(data.icons?.some((icon) => icon.purpose === "maskable"));
});

test("service worker caches only public PWA shell assets", async () => {
  const worker = await readFile(`${root}/public/sw.js`, "utf8");
  assert.match(worker, /offline\.html/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.doesNotMatch(worker, /api\/|user-picks|firebase|Authorization/);
  assert.doesNotMatch(worker, /sync|periodicSync/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(worker, /keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
});

test("service-worker registration failures are handled", async () => {
  const controls = await readFile(
    `${root}/src/components/pwa/pwa-controls.tsx`,
    "utf8"
  );
  assert.match(controls, /serviceWorker[\s\S]*\.register\("\/sw\.js"\)[\s\S]*\.catch\(/);
  assert.match(controls, /Service worker registration failed/);
});

test("offline page explains that picks are not queued", async () => {
  const offline = await readFile(`${root}/public/offline.html`, "utf8");
  assert.match(offline, /internet connection/i);
  assert.match(offline, /not queued/i);
});
