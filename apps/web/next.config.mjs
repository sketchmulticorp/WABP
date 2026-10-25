/**
 * Optional same-origin transport only: NestJS still owns authentication and authorization.
 * The fixed upstream is deployment configuration, never a request/query-supplied URL.
 */
const upstream = process.env.API_PROXY_URL;
const sameOrigin = process.env.NEXT_PUBLIC_API_URL === "/api/v1";

if (sameOrigin !== Boolean(upstream)) {
  throw new Error("Set NEXT_PUBLIC_API_URL=/api/v1 and API_PROXY_URL together for proxy mode.");
}

if (upstream) {
  const target = new URL(upstream);
  const privateHttp = target.protocol === "http:" && target.hostname.endsWith(".railway.internal");
  const localComposeHttp = target.protocol === "http:" && target.hostname === "api";
  if (
    !(target.protocol === "https:" || privateHttp || localComposeHttp) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/api/v1" ||
    target.href !== upstream
  ) {
    throw new Error(
      "API_PROXY_URL must be a fixed HTTPS or private Railway HTTP URL ending in /api/v1, without credentials, query or fragment.",
    );
  }
}

/** @type {import('next').NextConfig} */
const config = {
  async rewrites() {
    return upstream ? [{ source: "/api/v1/:path*", destination: `${upstream}/:path*` }] : [];
  },
};

export default config;
