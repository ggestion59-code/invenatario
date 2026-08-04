/* ============================================================
   sw.js — INTERRUPTOR DE APAGADO del Service Worker
   Reemplaza tu sw.js por este. Al cargar la página, este SW:
     1) borra TODOS los cachés,
     2) se desregistra solo,
     3) recarga las ventanas abiertas con la versión fresca.
   No tiene manejador de 'fetch', así que NUNCA sirve caché:
   todas las peticiones van directo a la red (Live Server / servidor).
   ============================================================ */

self.addEventListener('install', function(e){
  // Activarse de inmediato, sin esperar
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    // 1) Borrar todos los cachés
    try{
      var keys = await caches.keys();
      await Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }catch(err){}
    // 2) Desregistrar este service worker
    try{ await self.registration.unregister(); }catch(err){}
    // 3) Recargar las ventanas abiertas para que tomen la versión fresca
    try{
      var cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(function(c){ try{ c.navigate(c.url); }catch(_){} });
    }catch(err){}
  })());
});

/* Sin 'fetch': el navegador va SIEMPRE a la red, nunca a caché. */