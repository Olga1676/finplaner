/*
 * sw.js — «сервис-воркер»: сохраняет файлы приложения в телефоне,
 * чтобы планер открывался даже без интернета.
 * Сами записи без интернета хранит Firebase (см. sync.js) и отправляет, когда сеть появится.
 *
 * При каждом изменении файлов приложения увеличивайте VERSION — тогда телефоны скачают новую версию.
 */
const VERSION = 'v2';
const CACHE = 'finplaner-' + VERSION;
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';

const SHELL = [
  './', './index.html', './styles.css', './app.js', './logic.js', './sync.js', './sounds.js', './firebase-config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('finplaner-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Библиотеки Firebase с номером версии не меняются — берём из памяти телефона.
  if (url.href.startsWith(FB)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  // Остальное чужое (база, вход Google) — не трогаем.
  if (url.origin !== self.location.origin) return;

  // Файлы приложения: сначала пробуем интернет (чтобы получать обновления), без сети — из памяти.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
