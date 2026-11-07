import { defineConfig } from 'vite';
// Relative URLs support both repository subpaths and a custom domain.
export default defineConfig({ base: './', build: { sourcemap: false }, server: { port: 5173, strictPort: true, watch:{ignored:['**/.local/**','**/.venv/**']},fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.local/**','**/.venv/**']} }, preview: { port: 4173, strictPort: true } });

