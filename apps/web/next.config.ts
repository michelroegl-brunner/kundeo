import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a standalone server bundle for lean self-host Docker images.
  output: "standalone",
  // Workspace packages ship raw TS/TSX; let Next compile them.
  transpilePackages: ["@kundeo/db", "@kundeo/auth"],
};

export default nextConfig;
