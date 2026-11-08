/* Service worker. Raise APP_VERSION in runtime.js and rebuild: VERSION follows it. */
const VERSION='taxwiz-1.0.8-beta';
const SHELL=["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "runtime.js?v=1.0.8-beta"];
const STATIC=["pdf.min.js", "pdf.worker.min.js", "html2canvas.min.js", "jspdf.umd.min.js", "pdf-lib.min.js", "fontkit.umd.min.js", "fonts.css", "assistant-hebrew-400-normal.woff", "assistant-hebrew-400-normal.woff2", "assistant-latin-400-normal.woff2", "assistant-hebrew-600-normal.woff2", "assistant-latin-600-normal.woff2", "assistant-hebrew-700-normal.woff2", "assistant-latin-700-normal.woff2", "frank-ruhl-libre-hebrew-500-normal.woff2", "frank-ruhl-libre-latin-500-normal.woff2", "frank-ruhl-libre-hebrew-700-normal.woff2", "frank-ruhl-libre-latin-700-normal.woff2"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll([...SHELL,...STATIC].map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  const p=u.pathname;
  // app code (page, runtime, manifest): network first, so a new upload shows at once; cache only when offline
  if(e.request.mode==='navigate'||/\/(index\.html|runtime\.js|manifest\.webmanifest)$/.test(p)||p.endsWith('/')){
    e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request.mode==='navigate'?'index.html':e.request,c));}return r;})
      .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))));return;}
  // libraries, fonts, forms, OCR data: cache first (they change only with a new version)
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request,c));}return r;})));
});
