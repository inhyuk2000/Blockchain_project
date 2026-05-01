import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  /** 루트 `.env`의 `VITE_*` 도 프론트에 주입 (백엔드와 같은 파일 사용 시) */
  envDir: path.resolve(__dirname, ".."),
});
