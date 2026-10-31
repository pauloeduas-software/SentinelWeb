import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import AppHeader from './components/AppHeader';
import AppSidebar from './components/AppSidebar';
import ComputadoresPage from './pages/computadores';
import AssetDetailPage from './pages/computadores/detalhe';
import PostosPage from './pages/postos';
import EstoquePage from './pages/estoque';
import LicencasPage from './pages/licencas';
import DescobertasPage from './pages/descobertas';
import UsuariosPage from './pages/usuarios';
import ConfiguracoesPage from './pages/configuracoes';
import ColaboradoresPage from './pages/colaboradores';
import ColaboradorPage from './pages/colaboradores/ficha';
import { caminhoDoColaborador } from './helpers/colaborador.helper';
import LoginPage from './pages/login';
import ContaPage from './pages/conta';
import TrocaObrigatoria from './pages/conta/components/TrocaObrigatoria';
import { useAuthStore, usePode } from './stores/auth.store';
import Notificacoes from './components/Notificacoes';
import ErroDaTela from './components/ErroDaTela';
import { useTituloDaAba } from './hooks/useTituloDaAba';

/**
 * Os endereços antigos da tela do ativo → `/computadores/:id`, preservando o id:
 * `/itam/assets/:id`, até a F6, e `/ativos/:id`, até a tela virar Computadores
 * (AH).
 *
 * Um `Navigate` com caminho literal não serve aqui: o id está na URL, e é ele
 * que a URL antiga carrega.
 */
function RedirecionarAtivo() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/computadores/${id ?? ''}`} replace />;
}

/**
 * Os endereços antigos da ficha do colaborador → `/colaboradores/:id`,
 * preservando o id.
 *
 * `/users/:id` ERA a ficha de quem recebe equipamento, quando colaborador e
 * usuário eram a mesma tabela; depois ela morou em `/configuracoes/colaboradores/:id`,
 * até ganhar página própria (AH). O id nunca mudou, então o link guardado num
 * chamado continua levando à pessoa certa.
 */
function RedirecionarColaborador() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={caminhoDoColaborador(id ?? '')} replace />;
}

/**
 * A ROTA QUE SÓ O ADMIN ABRE — Usuários, hoje.
 *
 * O menu já escondia o item, mas esconder o item não fecha a URL: quem colava
 * `/usuarios` (ou seguia um link antigo) via a tela inteira, com o botão de
 * cadastrar e as ações de linha, e tudo voltava 403 — a tela é `ADMIN` até para
 * ler (`server/modules/access/helpers/route-permissions.ts`).
 * Uma tela em que tudo falha é pior do que não chegar nela.
 *
 * Redireciona para a raiz, e não para uma tela de "sem acesso": a raiz já leva
 * para Computadores, que é a tela do trabalho do dia. `replace` pelo mesmo motivo do
 * redirecionamento da raiz — voltar não pode cair aqui de novo.
 *
 * Como o `usePode`, isto é INTERFACE, não segurança: quem autoriza é o servidor.
 */
function SoAdmin({ children }: { children: React.ReactNode }) {
  const pode = usePode('ADMIN');
  return pode ? <>{children}</> : <Navigate to="/" replace />;
}

// Só o esqueleto da aplicação: moldura e rotas. Estado, chamada de API e regra
// de tela ficam nas páginas (pages/<contexto>/hooks) e nos stores de domínio.
function Layout() {
  const { pathname } = useLocation();
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
          <ErroDaTela chave={pathname}>
            <Routes>
              {/* A RAIZ LEVA AOS ATIVOS, e isso é o fim de uma tela.
                  `/` era a telemetria: a frota em cards, que ninguém abria para
                  perguntar nada — ela sabia a medida da máquina e não sabia de quem
                  a máquina é. A telemetria foi para a ficha do ativo e a do posto, e
                  a raiz passou a levar para a tela que se usa de verdade, que é a
                  lista de COMPUTADORES. `replace` para que o botão de voltar não
                  jogue a pessoa de volta na raiz, num pingue-pongue. */}
              <Route path="/" element={<Navigate to="/computadores" replace />} />
              <Route path="/computadores" element={<ComputadoresPage />} />
              {/* A tela do ativo. Rota própria, e não modal: é uma URL que se cola
                  no chamado, se abre em outra aba e se guarda nos favoritos. */}
              <Route path="/computadores/:id" element={<AssetDetailPage />} />
              {/* AS ROTAS ANTIGAS, redirecionando. `/itam` era o nome da tela até a
                  F6; ele saiu porque "ITAM" é o nome do ASSUNTO do sistema inteiro,
                  não desta tela. `/ativos` veio depois, e saiu quando "Ativos" virou
                  o nome da seção do menu e a tela passou a ter o nome do que lista:
                  computadores (AH). O redirecionamento fica porque quem colar uma
                  URL antiga tem que chegar na tela, não num 404. */}
              <Route path="/ativos" element={<Navigate to="/computadores" replace />} />
              <Route path="/ativos/:id" element={<RedirecionarAtivo />} />
              <Route path="/itam" element={<Navigate to="/computadores" replace />} />
              <Route path="/itam/assets/:id" element={<RedirecionarAtivo />} />
              <Route path="/postos" element={<PostosPage />} />
              {/* A FICHA DO POSTO É ROTA, e é a mesma tela: a listagem fica atrás
                  da janela. É destino de link porque a busca por etiqueta larga
                  aqui quem bipou o computador de uma mesa — ele saiu de /computadores. */}
              <Route path="/postos/:id" element={<PostosPage />} />
              {/* O ESTOQUE: monitor, teclado, mouse, cabo — o que tem
                  quantidade e não patrimônio (docs/decisoes/estoque.md). Perto
                  de Postos porque a entrega pode ir para uma mesa, e perto de
                  Licenças porque as duas são posse consumida em unidade. */}
              <Route path="/estoque" element={<EstoquePage />} />
              <Route path="/licencas" element={<LicencasPage />} />
              {/* O QUE O AGENTE VÊ E O CADASTRO NÃO SABE (F7). A rota leva o nome
                  do que a tela LISTA — descobertas —, e não o do processo que roda
                  por trás: `/reconciliacao` seria o mesmo erro que `/itam` foi até
                  a F6, nomear a tela pelo assunto em vez de pelo conteúdo. */}
              <Route path="/descobertas" element={<DescobertasPage />} />
              {/* QUEM OPERA O SISTEMA é assunto do Administrador: quem não é nem
                  vê o item no menu (navegacao.ts), e a URL digitada volta para a
                  raiz. Com um cargo só (Z), todo mundo passa. `/users` era o
                  nome antigo. */}
              <Route path="/usuarios" element={<SoAdmin><UsuariosPage /></SoAdmin>} />
              <Route path="/users" element={<Navigate to="/usuarios" replace />} />
              <Route path="/users/:id" element={<RedirecionarColaborador />} />
              <Route path="/colaboradores" element={<ColaboradoresPage />} />
              {/* A FICHA DO COLABORADOR: os dois baldes de posse
                  (docs/referencia/modelo-de-posse.md, Camada 3). Debaixo de
                  Colaboradores porque é de lá que ela abre, e é isso que acende o
                  item certo no menu. */}
              <Route path="/colaboradores/:id" element={<ColaboradorPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              {/* MINHA CONTA (AR): cada um edita o próprio nome e troca a própria
                  senha. Não está no menu — abre pelo nome, no rodapé da barra. */}
              <Route path="/conta" element={<ContaPage />} />
              <Route path="/configuracoes/colaboradores/:id" element={<RedirecionarColaborador />} />
              {/* ENDEREÇO QUE NÃO EXISTE (um erro de digitação, um link de tela que
                  saiu) volta para a raiz, como o `SoAdmin`: sem isto a moldura
                  abria com o conteúdo em branco. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErroDaTela>
        </main>
      </div>
    </div>
  );
}

/**
 * Sem sessão, para o login LEVANDO o endereço de agora: a sessão venceu no meio
 * do trabalho, ou o link de um chamado foi aberto sem login, e depois de entrar a
 * pessoa vai para aquela tela, e não para a raiz — como o Snipe-IT faz.
 *
 * Menos depois do Sair: quem entra em seguida pode ser outra pessoa, e não tem
 * por que cair na última tela de quem saiu.
 *
 * No `state` da navegação, e não num `?redirectTo=` da URL: o `state` só nasce
 * de dentro do painel, então não há link de fora que mande alguém, depois do
 * login, para um endereço escolhido por outro (open redirect).
 */
function IrParaLogin() {
  const { pathname, search } = useLocation();
  const saiu = useAuthStore((estado) => estado.saiu);
  return <Navigate to="/login" replace state={saiu ? null : { de: pathname + search }} />;
}

/** Já logado em /login: volta para onde estava quando a sessão caiu, ou para a raiz. */
function VoltarDeOndeVeio() {
  const { state } = useLocation();
  const de = (state as { de?: unknown } | null)?.de;
  // Só caminho interno: `//outro-site` começa com `/` mas é endereço de fora.
  const valido = typeof de === 'string' && de.startsWith('/') && !de.startsWith('//') && !de.startsWith('/login');
  return <Navigate to={valido ? de : '/'} replace />;
}

/** O título da aba, dentro do roteador: vale para toda tela, o login inclusive. */
function TituloDaAba() {
  useTituloDaAba();
  return null;
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
// usuário (src/stores/auth.store.ts) e esta função passa a desenhar a tela
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

  return (
    <BrowserRouter>
      <TituloDaAba />
      {verificando ? <Verificando /> : (
        <Routes>
          {/* Já logado em /login: volta para o painel (para a tela onde estava,
              se a sessão caiu nela), em vez de mostrar um formulário que não
              tem o que fazer. */}
          <Route path="/login" element={usuario ? <VoltarDeOndeVeio /> : <LoginPage />} />
          {/* Entrou com a senha temporária (AR): só a troca de senha, sem menu.
              O servidor recusa o resto com 403 até ela, então qualquer tela
              seria uma tela que falha. */}
          <Route
            path="/*"
            element={!usuario
              ? <IrParaLogin />
              : usuario.mustChangePassword ? <TrocaObrigatoria /> : <Layout />}
          />
        </Routes>
      )}
      {/* Fora das rotas, mas DENTRO do roteador: a pilha sobrevive à troca de
          tela e vale também no login, e o cartão pode ter link — a recusa que
          aponta para cada licença a devolver. A fila é um store
          (hooks/useNotificacao), não um contexto. */}
      <Notificacoes />
    </BrowserRouter>
  );
}
