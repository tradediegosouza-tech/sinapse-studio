import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: caminho do GitHub Pages (https://tradediegosouza-tech.github.io/sinapse-studio/).
// Em domínio próprio (ex.: studio.aisinapse.com.br), definir VITE_BASE='/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/sinapse-studio/',
  plugins: [react()],
})
