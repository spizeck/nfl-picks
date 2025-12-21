import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
        pathname: '/i/teamlogos/nfl/**',
      },
    ],
  },
};
export default nextConfig;