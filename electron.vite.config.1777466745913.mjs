// electron.vite.config.js
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";
var __electron_vite_injected_import_meta_url = "file:///C:/Users/Cyrus/Documents/coding-shit/electron/001%20LyricFloat/LyricFloat/electron.vite.config.js";
var __dirname = fileURLToPath(new URL(".", __electron_vite_injected_import_meta_url));
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.js") }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/preload.js") }
      }
    }
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          lyrics: resolve(__dirname, "src/renderer/lyrics.html"),
          settings: resolve(__dirname, "src/renderer/settings.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
