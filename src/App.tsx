import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppHeader from './pages/components/AppHeader';
import TelemetryPage from './pages/telemetria';
import ItamPage from './pages/gestao-itam';
import UsersPage from './pages/gestao-usuario';

// Só o esqueleto da aplicação: moldura e rotas. Estado, chamada de API e regra
// de tela ficam nas páginas (pages/<contexto>/hooks) e nos stores de domínio.
function Layout() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary selection:bg-status-info/20 font-sans flex flex-col">
      <AppHeader />

      <main className="flex-1 p-6 md:p-8">
        <Routes>
          <Route path="/" element={<TelemetryPage />} />
          <Route path="/itam" element={<ItamPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
