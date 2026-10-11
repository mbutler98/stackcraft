/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * GitHub Pages project-site base path.
 *
 * The site is served from https://<github-user>.github.io/<repository-name>/,
 * so every asset URL must be prefixed with "/<repository-name>/".
 * If you fork or rename the repository, change REPO_NAME (or set the
 * STACKCRAFT_BASE env var at build time, e.g. "/" for a custom domain).
 */
const REPO_NAME = "stackcraft";
const base = process.env.STACKCRAFT_BASE ?? `/${REPO_NAME}/`;

export default defineConfig(({ command }) => ({
  base: command === "build" ? base : "/",
  plugins: [react(), tailwindcss()],
  // One interactive SPA; React Flow is most of the bundle. Gzipped size is ~210 kB.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
