// Service worker do DOMINIUM — app shell (Fase 1) + cold start offline (Fase 2).
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
//
// IMPORTANTE (bug já corrigido uma vez, não reintroduzir): uma rota
// protegida (ex.: /lancamentos) pedida sem sessão válida é redirecionada
// pelo proxy pra /login. Se essa resposta REDIRECIONADA for guardada no
// cache sob a chave da rota original, o Safari se recusa a servir esse
// Response depois ("Response served by service worker has redirections")
// — e mesmo em browsers tolerantes seria a página errada. NUNCA chame
// cache.put()/cache.add() sem antes checar response.ok && !response.redirected.
const CACHE_VERSION = "v3";
const CACHE_NAME = `dominium-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

// Rotas com HTML pré-renderizado como conteúdo estático (sem dado
// server-side personalizado — cada uma busca tudo via /api/* no cliente),
// por isso é seguro pré-cachear: cold start offline abre o app shell
// correto pra essas rotas em vez de cair direto no fallback /offline.
// Só cobre o que a Fase 2 promete funcionar offline; outras rotas
// protegidas continuam sem shell offline garantido.
//
// O install do SW pode acontecer ANTES do usuário logar (ex.: primeira
// visita cai em /login), então /dashboard e /lancamentos podem não ficar
// cacheados aqui ainda (o fetch seria redirecionado e, com a checagem
// acima, simplesmente não é guardado). Por isso o app também "esquenta"
// essas rotas do lado do cliente assim que confirma uma sessão válida —
// ver frontend/src/lib/offline/shellCache.ts (usa o MESMO nome de cache).
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/login",
  "/dashboard",
  "/lancamentos",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Única porta de entrada pro cache: nunca guarda redirect nem resposta
// quebrada como se fosse o shell de uma rota.
async function guardarNoCacheSeValido(cache, requestOuUrl, response) {
  if (response && response.ok && !response.redirected) {
    await cache.put(requestOuUrl, response);
  }
}

async function precache(cache, url) {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    await guardarNoCacheSeValido(cache, url, response);
  } catch {
    // sem rede no install: sem problema, tenta de novo numa próxima
    // atualização do SW ou via aquecimento do lado do cliente.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(PRECACHE_URLS.map((url) => precache(cache, url)))));
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
          // Só cacheia se for a resposta final e válida da própria rota
          // pedida (ver guardarNoCacheSeValido) — uma resposta redirecionada
          // (ex.: sem sessão, proxy manda pro /login) NUNCA é gravada aqui,
          // mas ainda é devolvida normalmente pro browser tratar ao vivo.
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
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
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
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
