import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { reloadOnServiceWorkerUpdate } from './lib/swUpdate'

reloadOnServiceWorkerUpdate()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
