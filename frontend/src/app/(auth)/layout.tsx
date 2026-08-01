import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-navy-900 px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Image
          src="/icons/icon-256.png"
          alt="DOMINIUM"
          width={216}
          height={216}
          className="rounded-full"
          priority
          unoptimized
        />
        <p className="font-brand text-base tracking-[0.15em] text-gold-500 uppercase">Personal Finance</p>
        <p className="text-xs tracking-[0.2em] text-gold-500 uppercase">Controle • Planeje • Conquiste</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
