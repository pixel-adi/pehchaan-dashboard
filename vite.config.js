import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes all asset URLs relative, so the site works on GitHub Pages
// project sites (username.github.io/repo-name/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
