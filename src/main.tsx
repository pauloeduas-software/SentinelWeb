import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './core/api/queryClient'
import './index.css'
import App from './App.tsx'
import Notificacoes from './pages/components/Notificacoes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* Irmã do App, e não dentro de uma rota: a pilha sobrevive à troca de
          tela e vale também no login. Não envolve nada — a fila é um store
          (pages/hooks/useNotificacao), não um contexto. */}
      <Notificacoes />
    </QueryClientProvider>
  </StrictMode>,
)
