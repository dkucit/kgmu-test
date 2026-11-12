const CACHE='kgmu-v99-kgmu-20261112';
const ASSETS=['./','./index.html','./schedule.json','./schedule-data.js','./img/kgmu-logo.webp','./cloud-sync.js','./community-extras.js','./kg-theme.css','./kg-ui.js','./kg-app.css','./kg-e.css','./kg-app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kgmu-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
/* Страницу (index.html) всегда сверяем с сервером: GitHub Pages разрешает кэшировать HTML 10 минут,
   и без этого после деплоя Telegram и браузеры показывают старую версию. Остальное — сеть, затем кэш. */
self.addEventListener('fetch',e=>{const request=e.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 const page=request.mode==='navigate'||/\/(index\.html)?$/.test(new URL(request.url).pathname);
 const net=page?fetch(request.url,{cache:'no-cache',credentials:'same-origin'}):fetch(request);
 e.respondWith(net.then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(page?'./index.html':request,copy));}return r;}).catch(()=>caches.match(page?'./index.html':request).then(r=>r||caches.match('./index.html'))));});
