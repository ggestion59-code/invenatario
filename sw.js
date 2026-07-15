/* AuditStock Pro — Service Worker (offline)
   Estrategia:
   - Navegación / HTML  → RED primero, cae a caché si no hay internet (así siempre ves la última versión publicada cuando hay conexión).
   - Recursos estáticos (fuentes, íconos, SheetJS) → CACHÉ primero (rápido y offline).
   - AppSheet / Cloudflare Worker / Google Drive → SIEMPRE por red (no se cachea data para no mostrar info vieja).
   Sube este archivo a la MISMA carpeta que el HTML en Netlify.

   ⚠ SUBE EL NÚMERO DE CACHE EN CADA DEPLOY. Si no lo subes, el navegador
     sigue sirviendo el index.html viejo y parece que no se actualizó nada.
*/
const CACHE = 'auditstock-v3';   // <<<<<< v2 → v3
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // addAll falla si alguno no existe; los agrego uno por uno ignorando errores.
      // 'reload' evita que el propio caché HTTP del navegador nos devuelva el index viejo.
      return Promise.all(APP_SHELL.map(function(u){
        return c.add(new Request(u, {cache: 'reload'})).catch(function(){ return c.add(u).catch(function(){}); });
      }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){
      if(self.registration.navigationPreload){ return self.registration.navigationPreload.enable().catch(function(){}); }
    }).then(function(){ return self.clients.claim(); })
     .then(function(){
       // Avisa a las pestañas abiertas que ya corre una versión nueva.
       return self.clients.matchAll({type:'window'}).then(function(cs){
         cs.forEach(function(c){ c.postMessage({type:'SW_ACTUALIZADO', version: CACHE}); });
       });
     })
  );
});

function esAPI(url){
  return /workers\.dev|appsheet\.com|script\.google\.com|drive\.google\.com|googleusercontent\.com/.test(url);
}

/* Página mínima por si ni el index está en caché (primera vez sin internet) */
function paginaSinConexion(){
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><title>Sin conexión</title>' +
    '<div style="font-family:system-ui;padding:40px;color:#1F2937">' +
    '<h1 style="color:#00205B">Sin conexión</h1>' +
    '<p>Abre AuditStock Pro al menos una vez <b>con internet</b> para que quede guardada en el equipo.</p>' +
    '</div>',
    {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}}
  );
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;          // POST/escrituras → red directa (la app las manda a la cola offline si fallan)
  if(esAPI(req.url)) return;                // AppSheet/Worker/Drive → red directa (sin caché)

  var aceptaHTML = (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  // Navegación / HTML → RED primero
  if(req.mode === 'navigate' || aceptaHTML){
    e.respondWith((async function(){
      try{
        var pre = await e.preloadResponse;
        var res = pre || await fetch(req);
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); }).catch(function(){});
        return res;
      }catch(err){
        // CADENA DE RESPALDO CORREGIDA: antes se cortaba en la primera promesa
        // y devolvía undefined → error de red justo cuando no había señal.
        var c = await caches.open(CACHE);
        return (await c.match(req)) ||
               (await c.match('./index.html')) ||
               (await c.match('./')) ||
               paginaSinConexion();
      }
    })());
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
      }).catch(function(){
        return new Response('', {status: 504, statusText: 'Sin conexión'});
      });
    })
  );
});

self.addEventListener('message', function(e){
  var d = e.data || {};
  if(d === 'SKIP_WAITING' || d.type === 'SKIP_WAITING') self.skipWaiting();
});
