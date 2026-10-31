/* 離線快取（Service Worker）。
   - 連得上網路時一律向伺服器確認並抓最新檔案（同時更新快取）；斷網、或網路慢到超過 4 秒時改用快取，所以離線可用。
   - 與旅遊規劃共用同一個 github.io 網域，所以快取名稱一律以 "at-" 開頭，清理舊快取時「只刪自己前綴的」，不碰其他應用的快取。
   - 只處理同網域的 GET 請求；匯率服務等跨網域請求完全不經過這裡。
   更新 App 時：把 VERSION 改成新版本號（並同步 js/app.js 的 APP_VERSION），舊快取會在新版啟用時自動清掉。 */
const VERSION = '1.0.0', PREFIX = 'at-', CACHE = PREFIX + VERSION, TIMEOUT = self.AT_TIMEOUT || 4000;
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/money.js', 'js/db.js', 'js/crypto.js', 'js/rates.js', 'js/ui.js', 'i18n/dict.js', 'js/i18n.js', 'js/lock.js',
  'js/deposit.js', 'js/invest.js', 'js/insurance.js', 'js/plans.js', 'js/overview.js', 'js/app.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload'：安裝時繞過瀏覽器的 HTTP 快取，確保存進去的是伺服器上最新的檔案
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), cached = await cache.match(r, { ignoreSearch: true });
    try {
      const net = fetch(r, { cache: 'no-cache' });
      const res = await (cached ? Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), TIMEOUT))]) : net);
      if (res && res.ok) cache.put(r, res.clone());
      return res;
    } catch (err) {
      return cached || (await cache.match('index.html')) || Response.error();
    }
  })());
});
