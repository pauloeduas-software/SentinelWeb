// A PILHA DE NOTIFICAÇÕES — canto inferior direito, por cima de tudo.
//
// Só desenha: a fila, os prazos e o teto moram em `pages/hooks/useNotificacao`.
// Montada UMA vez, em `main.tsx`, fora das rotas — assim vale para toda tela,
// login incluído, e trocar de página não apaga um erro que ainda está sendo
// lido.
//
// CANTO INFERIOR DIREITO porque é o canto que nada usa: o topo é do cabeçalho e
// da busca, a esquerda é da barra lateral, e os modais abrem no centro.
// `z-[60]` fica acima do
// `z-50` dos modais: o erro de um "Salvar" dentro do modal tem que aparecer na
// frente dele, não atrás do véu.
//
// `pointer-events-none` no contêiner e `auto` em cada cartão: o espaço vazio
// entre eles não pode engolir o clique no que está embaixo.

import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react';
import { useNotificacoes, type Notificacao, type TipoNotificacao } from '../hooks/useNotificacao';

// A cor está na borda e no ícone, e NUNCA sozinha: o ícone muda de forma junto
// (círculo com !, triângulo, check), e quem não distingue vermelho de verde
// continua sabendo o que leu.
const ESTILO: Record<TipoNotificacao, { borda: string; cor: string; Icone: typeof CircleAlert }> = {
  erro: { borda: 'border-l-status-danger', cor: 'text-status-danger', Icone: CircleAlert },
  aviso: { borda: 'border-l-status-warning', cor: 'text-status-warning', Icone: TriangleAlert },
  sucesso: { borda: 'border-l-status-success', cor: 'text-status-success', Icone: CircleCheck },
};

function Cartao({ notificacao, onFechar }: { notificacao: Notificacao; onFechar: () => void }) {
  const { borda, cor, Icone } = ESTILO[notificacao.tipo];

  return (
    <div
      // ERRO É `alert`, o resto é `status`. `alert` é anunciado na hora pelo
      // leitor de tela, interrompendo o que ele estiver lendo — certo para
      // "não deu para excluir", errado para "salvo". `aria-atomic` faz a
      // mensagem ser lida inteira, não só o trecho que mudou.
      role={notificacao.tipo === 'erro' ? 'alert' : 'status'}
      aria-atomic="true"
      className={`pointer-events-auto flex items-start gap-3 w-full bg-surface-card border border-border-sutil border-l-2 ${borda} shadow-2xl px-4 py-3 font-mono text-xs text-text-primary`}
    >
      <Icone size={14} className={`${cor} mt-0.5 shrink-0`} aria-hidden="true" />
      {/* `break-words` porque a mensagem vem do servidor e às vezes carrega um
          identificador comprido sem espaço — sem isso, o cartão estoura. */}
      <p className="flex-1 min-w-0 break-words leading-relaxed">{notificacao.mensagem}</p>
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

  if (fila.length === 0) return null;

  return (
    // No celular ocupa a largura toda (menos a margem); no desktop, uma coluna
    // de largura fixa — mensagem de erro é frase, não parágrafo.
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-[60] flex flex-col gap-2 pointer-events-none">
      {fila.map((notificacao) => (
        <Cartao key={notificacao.id} notificacao={notificacao} onFechar={() => fechar(notificacao.id)} />
      ))}
    </div>
  );
}
