import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base: caminho do GitHub Pages (https://tradediegosouza-tech.github.io/sinapse-studio/).
// Se um dia for para um subdomínio próprio (ex.: studio.aisinapse.com.br), trocar para '/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/sinapse-studio/',
  plugins: [react()],
})
