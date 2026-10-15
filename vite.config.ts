import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // supabase/functions/mcp/index.ts é mantido à mão (wrapper de token de serviço em cima do bundle).
  // O plugin gera o bundle de referência fora de supabase/functions para não sobrescrever o arquivo owned.
  plugins: [react(), mode === "development" && componentTagger(), mcpPlugin({ functionsDir: ".lovable/mcp-generated" })].filter(Boolean),

  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
