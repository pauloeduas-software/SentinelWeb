import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import AppHeader from './pages/components/AppHeader';
import AppSidebar from './pages/components/AppSidebar';
import TelemetryPage from './pages/telemetria';
import AtivosPage from './pages/ativos';
import AssetDetailPage from './pages/ativos/detalhe';
import PostosPage from './pages/postos';
import LicencasPage from './pages/licencas';
import DescobertasPage from './pages/descobertas';
import UsersPage from './pages/gestao-usuario';
import UserDetailPage from './pages/gestao-usuario/detalhe';
import ConfiguracoesPage from './pages/configuracoes';
import LoginPage from './pages/login';
import { useAuthStore } from './domain/auth/auth.store';
import { useFormatoDoSistema } from './pages/hooks/useSistema';

/**
 * `/itam/assets/:id` → `/ativos/:id`, preservando o id.
 *
 * Um `Navigate` com caminho literal não serve aqui: o id está na URL, e é ele
 * que a URL antiga carrega.
 */
function RedirecionarAtivo() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/ativos/${id ?? ''}`} replace />;
}

// Só o esqueleto da aplicação: moldura e rotas. Estado, chamada de API e regra
// de tela ficam nas páginas (pages/<contexto>/hooks) e nos stores de domínio.
function Layout() {
  // A CONFIGURAÇÃO DE SISTEMA (F10) é aplicada AQUI, e só aqui: acima do
  // roteador, porque formato de número e de data valem para toda tela, e dentro
  // do `Layout`, porque a rota pede sessão — a configuração não é pública.
  useFormatoDoSistema();

  return (
    // A MOLDURA EM DUAS COLUNAS: barra lateral e, ao lado, cabeçalho + conteúdo.
    //
    // `min-w-0` NA COLUNA DA DIREITA É O QUE MATA A ROLAGEM HORIZONTAL, e não é
    // detalhe de estilo. Um filho de flex tem `min-width: auto` por padrão, ou
    // seja: ele se recusa a ficar menor que o próprio conteúdo. Com uma tabela
    // larga dentro, a coluna empurrava a linha inteira além da janela e a
    // PÁGINA ganhava barra de rolagem lateral — levando o cabeçalho e a barra
    // junto. Com `min-w-0` a coluna encolhe, e a rolagem acontece onde deve:
    // dentro do `overflow-x-auto` que cada tabela já tem em volta de si.
    //
    // `overflow-x-clip` no `<main>` é o cinto de segurança para o que ainda não
    // tem esse contêiner: uma tela nova com conteúdo largo passa a ser cortada
    // ali, em vez de desalinhar a moldura toda.
    <div className="min-h-screen bg-bg-base text-text-primary selection:bg-status-info/20 font-sans flex">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />

        <main className="min-w-0 flex-1 overflow-x-clip p-4 md:p-8">
          <Routes>
            <Route path="/" element={<TelemetryPage />} />
            <Route path="/ativos" element={<AtivosPage />} />
            {/* A tela do ativo. Rota própria, e não modal: é uma URL que se cola
                no chamado, se abre em outra aba e se guarda nos favoritos. */}
            <Route path="/ativos/:id" element={<AssetDetailPage />} />
            {/* AS ROTAS ANTIGAS, redirecionando. `/itam` era o nome da tela até a
                F6; ele saiu porque "ITAM" é o nome do ASSUNTO do sistema inteiro,
                não desta tela — que lista ATIVOS, como /licencas lista licenças.
                O redirecionamento fica porque quem colar uma URL antiga tem que
                chegar na tela, não num 404. */}
            <Route path="/itam" element={<Navigate to="/ativos" replace />} />
            <Route path="/itam/assets/:id" element={<RedirecionarAtivo />} />
            <Route path="/postos" element={<PostosPage />} />
            {/* A FICHA DO POSTO É ROTA, e é a mesma tela: a listagem fica atrás
                da janela. É destino de link porque a busca por etiqueta larga
                aqui quem bipou o computador de uma mesa — ele saiu de /ativos. */}
            <Route path="/postos/:id" element={<PostosPage />} />
            <Route path="/licencas" element={<LicencasPage />} />
            {/* O QUE O AGENTE VÊ E O CADASTRO NÃO SABE (F7). A rota leva o nome
                do que a tela LISTA — descobertas —, e não o do processo que roda
                por trás: `/reconciliacao` seria o mesmo erro que `/itam` foi até
                a F6, nomear a tela pelo assunto em vez de pelo conteúdo. */}
            <Route path="/descobertas" element={<DescobertasPage />} />
            <Route path="/users" element={<UsersPage />} />
            {/* Perfil do colaborador: os dois baldes de posse
                (docs/referencia/modelo-de-posse.md, Camada 3). Depois de `/users` porque o
                react-router escolhe a rota MAIS específica, não a primeira — a
                ordem aqui é para quem lê. */}
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          </Routes>
        </main>
      </div>
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
        <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/*" element={usuario ? <Layout /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
