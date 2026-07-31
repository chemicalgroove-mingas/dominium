import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROTAS_PUBLICAS = ["/login", "/cadastro", "/recuperar-senha", "/redefinir-senha", "/confirmar-email"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const temSessao = Boolean(request.cookies.get("dominium_token")?.value);
  const rotaPublica = ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota));

  if (pathname === "/") {
    return NextResponse.redirect(new URL(temSessao ? "/dashboard" : "/login", request.url));
  }

  if (!temSessao && !rotaPublica) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (temSessao && rotaPublica) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|manifest.json|favicon.ico).*)"],
};
