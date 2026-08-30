import type { NextConfig } from "next"

const backendOrigin =
  process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000"

const nextConfig: NextConfig = {
  // Same-origin /api so HttpOnly JWT cookies are visible to Next middleware.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
