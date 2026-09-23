import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppHeader from './pages/components/AppHeader';
import TelemetryPage from './pages/telemetria';
import ItamPage from './pages/gestao-itam';
import AssetDetailPage from './pages/gestao-itam/detalhe';
import PostosPage from './pages/postos';
import EstoquePage from './pages/estoque';
import UsersPage from './pages/gestao-usuario';
import UserDetailPage from './pages/gestao-usuario/detalhe';
import ConfiguracoesPage from './pages/configuracoes';
import LoginPage from './pages/login';
import AceitePage from './pages/aceite';
import TokensPage from './pages/tokens';
import { useAuthStore } from './domain/auth/auth.store';

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
          {/* A tela do ativo. Rota própria, e não modal: é uma URL que se cola
              no chamado, se abre em outra aba e se guarda nos favoritos. */}
          <Route path="/itam/assets/:id" element={<AssetDetailPage />} />
          <Route path="/postos" element={<PostosPage />} />
          {/* O que tem QUANTIDADE: acessório, consumível, componente (F5).
              Rota irmã de /itam, e não uma aba dentro dela: um mouse não é um
              ativo, e misturar os dois na mesma tabela daria metade das células
              vazias (não há etiqueta nem série a mostrar). */}
          <Route path="/estoque" element={<EstoquePage />} />
          <Route path="/users" element={<UsersPage />} />
          {/* Perfil do colaborador: os dois baldes de posse e o desligamento
              (docs/MODELO-POSSE.md, Camada 3). Depois de `/users` porque o
              react-router escolhe a rota MAIS específica, não a primeira — a
              ordem aqui é para quem lê. */}
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/tokens" element={<TokensPage />} />
        </Routes>
      </main>
    </div>
  );
}

// A tela dos primeiros milissegundos: o painel já sabe que existe um cookie,
// mas ainda não sabe de quem. Sem ela, quem recarrega uma página interna vê a
// tela de login piscar antes de voltar para onde estava.
function Verificando() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <span className="font-mono text-xs uppercase tracking-widest text-text-tertiary">
        Verificando sessão...
      </span>
    </div>
  );
}

// A MOLDURA, E A ÚNICA DECISÃO DE "ENTROU OU NÃO ENTROU".
//
// Um lugar só, olhando o store: qualquer 401 vindo de qualquer tela limpa o
// usuário (src/domain/auth/auth.store.ts) e esta função passa a desenhar a tela
// de login — sem recarregar a página e sem cada tela precisar saber disso.
//
// Isto NÃO é a segurança: a segurança é o `preHandler` do servidor, que fecha
// tudo por padrão. Aqui é só navegação — esconder um menu não protege dado
// nenhum, e é por isso que a decisão não pode existir só no navegador.
export default function App() {
  const usuario = useAuthStore((estado) => estado.usuario);
  const verificando = useAuthStore((estado) => estado.verificando);
  const conferirSessao = useAuthStore((estado) => estado.conferirSessao);

  // Uma vez, ao abrir o painel: o cookie é httpOnly, então a única maneira de
  // saber se há sessão é perguntar ao servidor.
  useEffect(() => {
    void conferirSessao();
  }, [conferirSessao]);

  if (verificando) return <Verificando />;

  return (
    <BrowserRouter>
      <Routes>
        {/* Já logado em /login: volta para o painel, em vez de mostrar um
            formulário que não tem o que fazer. */}
        {/* O TERMO DE ENTREGA vive FORA do `Layout` e antes da checagem de
            sessão: quem o abre veio de um e-mail e pode não ter conta nenhuma —
            no alvo LOCATION quem assina é o gestor da localidade (D27). Mandá-lo
            para o login seria fechar a porta justamente no caso que a página
            existe para cobrir. Quem autoriza é o token na URL. */}
        <Route path="/aceite/:token" element={<AceitePage />} />
        <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/*" element={usuario ? <Layout /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
