import React from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tailwind.css'
import { Popup } from './Popup'
import { ErrorBoundary } from '@/shared/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  </React.StrictMode>,
)
