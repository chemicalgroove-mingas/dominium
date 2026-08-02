// Service worker do DOMINIUM — Fase 1 (somente app shell, instalável).
//
// Regra inegociável: nada relacionado a /api/* passa por aqui. Dado
// financeiro (saldo, lançamento, pagamento) é sempre buscado direto na
// rede ou não é mostrado — nunca uma resposta de cache.
//
// O que este SW cacheia: HTML de navegação (para abrir rápido / fallback
// offline) e assets estáticos (JS/CSS com hash de build, ícones, manifest).
// Bump CACHE_VERSION quando a lógica deste arquivo mudar; assets com hash
// de build (_next/static/*) já ficam automaticamente "frescos" a cada
// deploy porque o nome do arquivo muda.

const CACHE_VERSION = "v2";
const CACHE_NAME = `dominium-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

// Rotas com HTML pré-renderizado como conteúdo estático (sem dado
// server-side personalizado — cada uma busca tudo via /api/* no cliente),
// por isso é seguro pré-cachear: cold start offline abre o app shell
// correto pra essas rotas em vez de cair direto no fallback /offline.
// Só cobre o que a Fase 2 promete funcionar offline; outras rotas
// protegidas continuam sem shell offline garantido.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/login",
  "/dashboard",
  "/lancamentos",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Bypass total: dados de API nunca passam pelo SW, nem para leitura de cache.
  if (isApiRequest(url)) return;

  // Navegação (documentos HTML): network-first, cai para cache do shell e
  // por fim para a página de fallback offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Assets estáticos do shell: cache-first, populado sob demanda.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});
