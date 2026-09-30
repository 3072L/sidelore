import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const publicAssets = ["manifest.webmanifest", "service-worker.js"];

export default defineConfig({
  root: appDir,
  plugins: [react(), {
    name: "sidelore-public-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = new URL(request.url ?? "/", "http://sidelore.invalid").pathname.slice(1);
        if (!["GET", "HEAD"].includes(request.method ?? "") || !publicAssets.includes(name)) return next();
        response.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : "application/manifest+json");
        response.end(request.method === "HEAD" ? undefined : readFileSync(resolve(appDir, "public", name)));
      });
    },
    generateBundle() {
      for (const name of publicAssets) {
        this.emitFile({ type: "asset", fileName: name, source: readFileSync(resolve(appDir, "public", name)) });
      }
    },
  }],
  // Copy only reviewed app assets; local files in public/ must never be bundled.
  publicDir: false,
  build: { outDir: resolve(appDir, "../../dist/web"), emptyOutDir: true }
});
