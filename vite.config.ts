import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // served from https://<user>.github.io/christmas-tree/
  plugins: [react()],
})
