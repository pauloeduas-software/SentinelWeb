// A PILHA DE NOTIFICAÇÕES — no canto inferior direito, por cima de tudo (BF).
//
// Só desenha: a fila, os prazos e o teto moram em `hooks/useNotificacao`.
// Montada UMA vez, no `App.tsx`, fora das rotas — assim vale para toda tela,
// login incluído, e trocar de página não apaga um erro que ainda está sendo
// lido.
//
// O Salvar do formulário lateral mora no mesmo canto. Por isso a recusa do formulário
// fica dentro dele (`FormularioLateral`), e o cartão que já estava na tela sai da
// frente quando o painel abre (`com-painel`): para o lado dele no desktop, para o
// alto onde ao lado não cabe, e ali ele cobre o título, e não os botões. `z-[60]` fica acima do `z-50`
// dos modais: o erro de um clique dentro da janela tem que aparecer na frente
// dela, não atrás do véu.
//
// `pointer-events-none` no contêiner e `auto` em cada cartão: o espaço vazio
// entre eles não pode engolir o clique no que está embaixo.

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useNotificacoes, usePrazoDoCartao, type Notificacao, type TipoNotificacao } from '../hooks/useNotificacao';
import { Link } from 'react-router-dom';

// A cor está na borda e no ícone, e NUNCA sozinha: o ícone muda de forma junto
// (círculo com !, triângulo, i, check), e quem não distingue vermelho de verde
// continua sabendo o que leu.
const ESTILO: Record<TipoNotificacao, { borda: string; cor: string; Icone: typeof CircleAlert }> = {
  erro: { borda: 'border-l-status-danger', cor: 'text-status-danger', Icone: CircleAlert },
  aviso: { borda: 'border-l-status-warning', cor: 'text-status-warning', Icone: TriangleAlert },
  info: { borda: 'border-l-status-info', cor: 'text-status-info', Icone: Info },
  sucesso: { borda: 'border-l-status-success', cor: 'text-status-success', Icone: CircleCheck },
};

function Cartao({ notificacao, onFechar }: { notificacao: Notificacao; onFechar: () => void }) {
  const { borda, cor, Icone } = ESTILO[notificacao.tipo];
  const prazo = usePrazoDoCartao(notificacao);

  return (
    <div
      {...prazo}
      // ERRO É `alert`, o resto é `status`. `alert` é anunciado na hora pelo
      // leitor de tela, interrompendo o que ele estiver lendo — certo para
      // "não deu para excluir", errado para "salvo". `aria-atomic` faz a
      // mensagem ser lida inteira, não só o trecho que mudou.
      role={notificacao.tipo === 'erro' ? 'alert' : 'status'}
      aria-atomic="true"
      // `data-notificacao`: o clique aqui não conta como clique fora da janela aberta.
      data-notificacao
      className={`pointer-events-auto flex items-start gap-3 w-full rounded-xl bg-surface-card/95 backdrop-blur-xl border border-border-sutil border-l-4 ${borda} shadow-2xl px-4 py-3 text-sm text-text-primary`}
    >
      <Icone size={16} className={`${cor} mt-0.5 shrink-0`} aria-hidden="true" />
      {/* `break-words` porque a mensagem vem do servidor e às vezes carrega um
          identificador comprido sem espaço — sem isso, o cartão estoura. */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="break-words leading-relaxed">{notificacao.mensagem}</p>
        {/* Os links da recusa — cada licença que precisa voltar, até a
            ficha dela, onde mora o Devolver. Clicar fecha o cartão. */}
        {notificacao.links && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {notificacao.links.map((link) => (
              <Link key={link.para} to={link.para} onClick={onFechar} className="underline underline-offset-2 hover:text-text-secondary">
                {link.rotulo}
              </Link>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar notificação"
        className="-m-1 p-1 text-text-tertiary hover:text-text-primary transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function Notificacoes() {
  const fila = useNotificacoes((estado) => estado.fila);
  const fechar = useNotificacoes((estado) => estado.acoes.fechar);

  return (
    // A REGIÃO FICA SEMPRE NA PÁGINA, vazia quando não há cartão. O leitor de tela só
    // anuncia o que muda numa região que já existia, e o `aria-live` é o que a deixa
    // de fora do que o modal do Radix esconde dele (`aria-hidden` pula quem o tem).
    //
    // No celular ocupa a largura toda (menos a margem); no desktop, uma coluna
    // de largura fixa — mensagem de erro é frase, não parágrafo. Os `37rem` são a
    // largura do painel (`sm:max-w-xl`) mais a margem.
    <section aria-label="Notificações" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none sm:left-auto sm:w-96 com-painel:bottom-auto com-painel:top-4 lg:com-painel:bottom-4 lg:com-painel:right-[37rem] lg:com-painel:top-auto">
      {fila.map((notificacao) => (
        <Cartao key={notificacao.id} notificacao={notificacao} onFechar={() => fechar(notificacao.id)} />
      ))}
    </section>
  );
}
