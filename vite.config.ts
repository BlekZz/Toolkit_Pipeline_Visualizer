import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the two heavyweight view engines into cacheable vendor chunks.
        // mermaid is NOT listed here — it is code-split via the lazy import in App.tsx
        // and must stay out of the initial bundle.
        manualChunks: {
          'vendor-fullcalendar': [
            '@fullcalendar/core',
            '@fullcalendar/react',
            '@fullcalendar/daygrid',
            '@fullcalendar/timegrid',
            '@fullcalendar/multimonth',
            '@fullcalendar/interaction',
          ],
          'vendor-gantt': ['@svar-ui/react-gantt'],
        },
      },
    },
  },
})
