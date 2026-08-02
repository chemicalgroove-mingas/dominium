// PRECISA bater com CACHE_NAME em public/sw.js (mesmo Cache Storage,
// compartilhado entre o Service Worker e a página). O install do SW pode
// acontecer antes do login (ex.: primeira visita cai em /login, sem
// cookie ainda) — nesse caso /dashboard e /lancamentos nunca são
// cacheados por lá. Por isso, sempre que o app confirma uma sessão válida
// (login, recarregar bem-sucedido), ele também "esquenta" essas rotas
// aqui, do lado do cliente, autenticado.
const CACHE_NAME = "dominium-shell-v4";
const ROTAS_SHELL_AUTENTICADO = ["/dashboard", "/lancamentos", "/pagamentos", "/investimentos"];

export async function aquecerShellOffline() {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      ROTAS_SHELL_AUTENTICADO.map(async (rota) => {
        try {
          const resposta = await fetch(rota, { credentials: "same-origin" });
          // Mesma regra do SW: nunca guarda redirect nem resposta inválida
          // como se fosse o shell de uma rota autenticada.
          if (resposta.ok && !resposta.redirected) {
            await cache.put(rota, resposta);
          }
        } catch {
          // Sem rede agora: sem problema, tenta de novo no próximo login/reconexão.
        }
      })
    );
  } catch {
    // Cache Storage indisponível — sem shell offline, mas o resto do app
    // continua funcionando normalmente online.
  }
}
