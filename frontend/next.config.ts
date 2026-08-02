import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem isso, Safari 15.6 (iPad Air 2 etc) pode ficar preso com HTML em cache
  // referenciando chunks JS de um build antigo (404 -> hydration nunca roda).
  async headers() {
    return [
      {
        source: "/((?!_next/static/.*).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
