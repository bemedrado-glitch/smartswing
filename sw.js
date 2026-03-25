const CACHE_NAME = 'smartswing-shell-v10';
const APP_ASSETS = [
  './',
  './index.html',
  './features.html',
  './how-it-works.html',
  './contact.html',
  './pricing.html',
  './library.html',
  './analyze.html',
  './dashboard.html',
  './coach-dashboard.html',
  './login.html',
  './signup.html',
  './auth-callback.html',
  './settings.html',
  './cart.html',
  './checkout.html',
  './payment-success.html',
  './payment-cancelled.html',
  './manifest.json',
  './pwa.js',
  './app-data.js',
  './assets/vendor/tf.min.js',
  './assets/vendor/pose-detection.min.js',
  './assets/vendor/mediapipe/pose/pose.js',
  './assets/vendor/mediapipe/pose/pose_web.binarypb',
  './assets/vendor/mediapipe/pose/pose_solution_packed_assets_loader.js',
  './assets/vendor/mediapipe/pose/pose_solution_packed_assets.data',
  './assets/vendor/mediapipe/pose/pose_solution_simd_wasm_bin.js',
  './assets/vendor/mediapipe/pose/pose_solution_simd_wasm_bin.data',
  './assets/vendor/mediapipe/pose/pose_solution_simd_wasm_bin.wasm',
  './assets/vendor/mediapipe/pose/pose_solution_wasm_bin.js',
  './assets/vendor/mediapipe/pose/pose_solution_wasm_bin.wasm',
  './assets/vendor/mediapipe/pose/pose_landmark_lite.tflite',
  './assets/vendor/mediapipe/pose/pose_landmark_full.tflite',
  './assets/vendor/mediapipe/pose/pose_landmark_heavy.tflite',
  './advanced-biomechanics-engine.js',
  './improved-pose-detection.js'
];

function isHtmlRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never hijack third-party requests with local HTML fallbacks.
  if (!sameOrigin) {
    event.respondWith(fetch(event.request));
    return;
  }

  const destination = event.request.destination || '';
  const htmlRequest = isHtmlRequest(event.request);
  const networkFirst = htmlRequest || destination === 'script' || destination === 'style' || destination === 'worker';

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          if (htmlRequest) return caches.match('./index.html');
          return new Response('Offline resource unavailable.', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Cache-first for static media and other same-origin assets.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(() => new Response('Offline resource unavailable.', { status: 503, statusText: 'Offline' }));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
