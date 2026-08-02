export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-900 px-6 text-center">
      <img src="/icons/icon-128.png" alt="DOMINIUM" className="h-16 w-16 rounded-full" />
      <h1 className="font-brand text-2xl text-cream-100">Você está offline</h1>
      <p className="max-w-xs text-sm text-cream-100/60">
        Reconecte para ver seus dados. O DOMINIUM não guarda saldos e lançamentos para uso offline —
        preferimos mostrar isso a exibir um valor desatualizado.
      </p>
      <a href="/dashboard" className="btn-gold mt-2 inline-block">
        Tentar novamente
      </a>
    </div>
  );
}
