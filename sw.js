/* Service worker: makes the app work offline after the first visit.
   Raise VERSION whenever you change any file, so devices pick up the new version. */
const VERSION='taxwiz-2026-11-04';
const ASSETS=[
 "./",
 "index.html",
 "runtime.js",
 "manifest.webmanifest",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "vendor/pdf.min.js",
 "vendor/pdf.worker.min.js",
 "vendor/html2canvas.min.js",
 "vendor/jspdf.umd.min.js",
 "vendor/fonts/fonts.css",
 "vendor/fonts/assistant-hebrew-400-normal.woff2",
 "vendor/fonts/assistant-latin-400-normal.woff2",
 "vendor/fonts/assistant-hebrew-600-normal.woff2",
 "vendor/fonts/assistant-latin-600-normal.woff2",
 "vendor/fonts/assistant-hebrew-700-normal.woff2",
 "vendor/fonts/assistant-latin-700-normal.woff2",
 "vendor/fonts/frank-ruhl-libre-hebrew-500-normal.woff2",
 "vendor/fonts/frank-ruhl-libre-latin-500-normal.woff2",
 "vendor/fonts/frank-ruhl-libre-hebrew-700-normal.woff2",
 "vendor/fonts/frank-ruhl-libre-latin-700-normal.woff2"
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return; // API calls go straight to the network
  if(e.request.mode==='navigate'){ // page: network first, so updates arrive; cache when offline
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put('index.html',c));return r;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request,c));}return r;})));
});
