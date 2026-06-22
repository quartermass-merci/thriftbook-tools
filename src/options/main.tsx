import React from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tailwind.css'
import { Options } from './Options'
import { ErrorBoundary } from '@/shared/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Options />
    </ErrorBoundary>
  </React.StrictMode>,
)
