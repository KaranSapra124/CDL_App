import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser calls /api/* on the admin origin. In development (and behind
  // Nginx in production) those requests are forwarded to the Go API, so the
  // HTTP-only session cookie is set on the same origin and no CORS is needed.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:8080";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
