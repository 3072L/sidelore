import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("dist/apps/desktop/src", { recursive: true });
copyFileSync("apps/desktop/src/preload.cjs", "dist/apps/desktop/src/preload.cjs");
