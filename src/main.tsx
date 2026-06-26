import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Spike guard — renders spike UI when ?spike=1 is in the URL.
// Remove this block after the spike is evaluated.
const isSpike = new URLSearchParams(window.location.search).get('spike') === '1'

if (isSpike) {
  const { default: SpikeApp } = await import('./spike/SpikeApp.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SpikeApp />
    </StrictMode>,
  )
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
