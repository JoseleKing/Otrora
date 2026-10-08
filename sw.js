// Service worker de Otrora.
// Estrategia: «primero la red» para los archivos propios (así el contenido nuevo
// llega en cuanto hay conexión) y caché como respaldo sin conexión.
// La red se consulta con `cache: 'no-cache'`: el navegador pregunta siempre al servidor
// si el archivo ha cambiado (si no, responde 304 y se usa su copia), en lugar de
// reutilizar sin preguntar durante los 10 minutos que permite GitHub Pages.
// Al añadir archivos nuevos a la lista, sube el número de VERSION.

const VERSION = 'otrora-v5';
const CACHE_FUENTES = 'otrora-fuentes';

const ARCHIVOS = [
  './',
  'index.html',
  'css/estilos.css',
  'js/app.js',
  'volver-almanaque.js',
  'data/palabras.json',
  'manifest.json',
  'icons/otrora-logo.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/otrora-192.png',
  'icons/otrora-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ARCHIVOS.map((ruta) => new Request(ruta, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION && c !== CACHE_FUENTES).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);

  // Tipografías de Google: primero la caché (no cambian).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evento.respondWith(
      caches.open(CACHE_FUENTES).then((cache) =>
        cache.match(peticion).then((guardada) => guardada || fetch(peticion).then((respuesta) => {
          if (respuesta.ok || respuesta.type === 'opaque') cache.put(peticion, respuesta.clone());
          return respuesta;
        }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Archivos propios: primero la red (siempre revalidada); si falla, la caché.
  // Una petición de navegación no admite opciones nuevas: se rehace a partir de su URL.
  const red = peticion.mode === 'navigate'
    ? fetch(peticion.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(peticion, { cache: 'no-cache' });
  evento.respondWith(
    red
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches.match(peticion, { ignoreSearch: true }).then((guardada) =>
          guardada || (peticion.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
