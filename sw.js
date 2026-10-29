/* 離線快取：連得上網路時一律抓最新檔案（並更新快取），斷網時改用快取。
   與旅遊規劃共用同一個 github.io 網域，所以快取名稱一律以 "at-" 開頭，
   而且清理舊快取時「只刪自己前綴的」，不碰其他應用的快取。 */
const PREFIX = 'at-', CACHE = PREFIX + 'v7';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/money.js', 'js/db.js', 'js/rates.js', 'js/sample.js', 'js/ui.js', 'js/deposit.js', 'js/invest.js', 'js/insurance.js', 'js/plans.js', 'js/overview.js', 'js/i18n.js', 'js/app.js', 'i18n/dict.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
