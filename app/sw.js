/* 赤刃 v3 App 实验版 SW：缓存名与资产 hash 绑定；install 不抢占；仅清本应用前缀 */
const CACHE = "redline-app-3a4f4c535a2f";
const PREFIX = "redline-app-";
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { await c.addAll(ASSETS); }
    catch (err) {
      const failed = [];
      for (const a of ASSETS) { try { await c.add(a); } catch (e2) { failed.push(a); } }
      throw new Error("precache-failed: " + failed.join(","));
    }
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.indexOf(PREFIX) === 0 && k !== CACHE).map(k => caches.delete(k)));
  })());
});
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(r);
    if (hit) return hit;
    try {
      const res = await fetch(r);
      if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)).catch(err => console.warn("cache-put-failed", err && err.message)); }
      return res;
    } catch (err) {
      if (r.mode === "navigate") { const f = await caches.match("./index.html"); if (f) return f; }
      throw err;
    }
  })());
});
