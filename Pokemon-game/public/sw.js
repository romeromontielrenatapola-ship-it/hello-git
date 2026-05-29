const CACHE_NAME = 'cybertcg-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/assets/icon.svg',
  '/assets/avatars/avatar_default.png',
  '/assets/avatars/avatar_blue.png',
  '/assets/avatars/avatar_green.png',
  '/assets/avatars/avatar_red.png',
  '/assets/avatars/avatar_yellow.png',
  '/assets/cards/placeholder.png'
];

// Instalar service worker y cachear recursos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activar service worker y limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar peticiones para dar soporte offline (Estrategia: Network first con Cache Fallback)
self.addEventListener('fetch', (event) => {
  // 1. Evitar interceptar peticiones que no sean GET
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. Evitar interceptar extensiones del navegador (chrome-extension://) o protocolos no HTTP
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // 3. Evitar interceptar peticiones de Live Reload, HMR o WebSockets de Angular en desarrollo
  if (
    event.request.url.includes('ng-cli-ws') || 
    event.request.url.includes('sockjs-node') || 
    event.request.url.includes('__webpack_hmr') ||
    event.request.url.includes('hot-update')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Clonar respuesta y guardarla en cache si es una peticion exitosa de recursos estaticos locales
        if (networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En caso de estar offline o error de red, buscar en cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Si no está en cache y es una navegación HTML (ej: ruta de Angular /dashboard), retornar index.html
          const acceptHeader = event.request.headers.get('accept');
          if (acceptHeader && acceptHeader.includes('text/html')) {
            return caches.match('/index.html').then((indexResponse) => {
              if (indexResponse) {
                return indexResponse;
              }
              // Fallback de texto si ni index.html se encuentra en caché
              return new Response('Offline: Recurso no disponible temporalmente.', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
              });
            });
          }
          
          // Fallback final para otros recursos (imágenes, json, etc.) para que no truene el navegador
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
