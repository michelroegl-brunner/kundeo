import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

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

// Absolute path to the installed pdfkit package root (resolves through the
// pnpm symlink to the store), used to force its font data into the trace below.
// pdfkit restricts `exports`, so resolve its main entry and walk up to the
// directory whose package.json is pdfkit's.
function resolvePdfkitDir(): string {
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve("pdfkit"));
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).name === "pdfkit") return dir;
      } catch {
        // keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate the pdfkit package root for file tracing.");
}
const pdfkitDir = resolvePdfkitDir();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a standalone server bundle for lean self-host Docker images.
  output: "standalone",
  // Workspace packages ship raw TS/TSX; let Next compile them.
  transpilePackages: ["@kundeo/db", "@kundeo/auth"],
  // pdfkit (Mahnung-PDF) reads its AFM font metrics from its own package at
  // runtime; keep it external so those data files survive the standalone trace.
  serverExternalPackages: ["pdfkit"],
  // pdfkit loads its built-in fonts by lazily `require()`-ing
  // js/standard-fonts/<Font>.cjs (+ the .afm metrics). Next's file tracer can't
  // follow those dynamic requires, so the standalone build would ship pdfkit
  // without Helvetica and `doc.font("Helvetica")` would throw at runtime. Force
  // the whole pdfkit js/ tree into the trace. These globs are resolved relative
  // to the project dir, so express the (pnpm-store) package path relative to it.
  outputFileTracingIncludes: {
    "/**": [join(relative(process.cwd(), pdfkitDir), "js", "**", "*")],
  },
};

export default nextConfig;
