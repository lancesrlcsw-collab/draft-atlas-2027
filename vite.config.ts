import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `VITE_TARGET=artifact` builds a copy that runs from any folder (relative URLs, hash routing),
// which is what a hosted Claude artifact needs. The default build is the normal website.
const artifact = process.env.VITE_TARGET === 'artifact'

export default defineConfig({
  plugins: [react()],
  base: artifact ? './' : '/',
  build: {
    outDir: artifact ? 'dist-artifact' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('@react-three') || id.includes('postprocessing') || id.includes('camera-controls') || id.includes('three-stdlib') || id.includes('maath')) return 'r3f'
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
})
