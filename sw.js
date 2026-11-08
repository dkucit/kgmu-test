const CACHE='kgmu-v872-light-20261108';
const ASSETS=['./','./index.html','./schedule.json','./schedule-data.js','./img/kgmu-logo.webp','./cloud-sync.js','./community-extras.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kgmu-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const request=e.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 e.respondWith(fetch(request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(request,copy));}return r;}).catch(()=>caches.match(request).then(r=>r||caches.match('./index.html'))));});
