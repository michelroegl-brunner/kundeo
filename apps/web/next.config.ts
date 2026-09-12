import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Env lives at the monorepo root .env (single source of truth; see
// turbo.json globalDependencies). Next only auto-loads apps/web/.env, so pull
// the root file into process.env for the dev/build/start runtime. Skipped when
// the vars are already present (CI, Docker, or an explicit shell export), and a
// no-op in the standalone image where no root .env is shipped.
if (!process.env.DATABASE_URL) {
  const rootEnv = join(process.cwd(), "..", "..", ".env");
  if (existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a standalone server bundle for lean self-host Docker images.
  output: "standalone",
  // Workspace packages ship raw TS/TSX; let Next compile them.
  transpilePackages: ["@kundeo/db", "@kundeo/auth"],
  // pdfkit (Mahnung-PDF) reads its AFM font metrics from its own package at
  // runtime; keep it external so those data files survive the standalone trace.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
