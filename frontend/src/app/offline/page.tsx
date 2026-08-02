export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-900 px-6 text-center">
      <img src="/icons/icon-128.png" alt="DOMINIUM" className="h-16 w-16 rounded-full" />
      <h1 className="font-brand text-2xl text-cream-100">Você está offline</h1>
      <p className="max-w-xs text-sm text-cream-100/60">
        Este aparelho ainda não tem uma sessão salva pra abrir o DOMINIUM assim. Reconecte para
        entrar. Depois de logado, saldos e lançamentos confirmados continuam nunca ficando
        guardados aqui — só a sessão, os agrupadores e os lançamentos que você criar offline até
        sincronizarem.
      </p>
      <a href="/dashboard" className="btn-gold mt-2 inline-block">
        Tentar novamente
      </a>
    </div>
  );
}
