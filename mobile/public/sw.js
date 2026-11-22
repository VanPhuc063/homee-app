// Service worker tối thiểu để trình duyệt cho "Cài đặt/Thêm vào màn hình chính". Bundle JS có hash
// trong tên nên cache-first an toàn; còn lại (HTML, API) luôn đi mạng.
// ponytail: chưa chạy offline hoàn toàn, thêm cache HTML/precache nếu cần mở app khi mất sóng.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/_expo/static/')) return;
  e.respondWith(
    caches.open('static').then(async (c) => (await c.match(e.request)) ?? c.add(e.request).then(() => c.match(e.request))),
  );
});
