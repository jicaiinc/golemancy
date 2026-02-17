import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    publicDir: 'src/renderer/public',
    // TODO [P-P2-001]: Consider adding build.rollupOptions.output.manualChunks to split
    // large vendor dependencies (@xyflow/react, motion, react-router) into separate chunks,
    // improving initial load time via parallel loading.
  },
})
