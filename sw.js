const CACHE = "latex-trainer-v1";
const CORE = [
  "./",
  "./index.html",
  "./help.json"
];

self.addEventListener("install", e => {
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k===CACHE?null:caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith((async()=>{
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const fetcher = fetch(e.request).then(res=>{
      if(res && (res.status===200 || res.type==="opaque")) cache.put(e.request,res.clone());
      return res;
    }).catch(()=>cached);
    return cached || fetcher;
  })());
});
