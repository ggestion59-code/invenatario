/* AuditStock Pro — Service Worker (offline)
   Estrategia:
   - Navegación / HTML  → RED primero, cae a caché si no hay internet (así siempre ves la última versión publicada cuando hay conexión).
   - Recursos estáticos (fuentes, íconos, SheetJS) → CACHÉ primero (rápido y offline).
   - AppSheet / Cloudflare Worker / Google Drive → SIEMPRE por red (no se cachea data para no mostrar info vieja).
   Sube este archivo a la MISMA carpeta que el HTML en Netlify.
*/
const CACHE = 'auditstock-v2';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // addAll falla si alguno no existe; los agrego uno por uno ignorando errores
      return Promise.all(APP_SHELL.map(function(u){ return c.add(u).catch(function(){}); }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function esAPI(url){
  return /workers\.dev|appsheet\.com|script\.google\.com|googleusercontent\.com|script\.googleusercontent/.test(url);
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;          // POST/escrituras → red directa
  if(esAPI(req.url)) return;                // AppSheet/Worker/Drive → red directa (sin caché)

  var aceptaHTML = (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  // Navegación / HTML → RED primero
  if(req.mode === 'navigate' || aceptaHTML){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        return res;
      }).catch(function(){
        return caches.match(req).then(function(r){ return r || caches.match('./index.html') || caches.match('./'); });
      })
    );
    return;
  }

  // Estáticos (fuentes, íconos, SheetJS, etc.) → CACHÉ primero
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && (res.status === 200 || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        }
        return res;
      });
    })
  );
});
