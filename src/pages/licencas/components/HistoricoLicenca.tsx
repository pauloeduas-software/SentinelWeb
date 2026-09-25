import { Eye, Flame, History } from 'lucide-react';
import type { EventoDaLicenca } from '../../../domain/shared/license.types';
import { lerEvento, momentoDoEvento, rotuloDaAcao } from '../../helpers/historico.helper';
import { ACOES_DA_LICENCA, ROTULOS_DA_LICENCA } from '../helpers/licenca.helper';

// A TRILHA DA LICENÇA — entregas, devoluções, queimas e REVELAÇÕES DA CHAVE.
//
// ═════════════════════════════════════════════════════════════════════════════
// SEM ESTA LISTA, O `VIEW_KEY` NÃO SERVE PARA NADA.
//
// Ele é a primeira ação do projeto que registra uma LEITURA, e existe para
// responder UMA pergunta: *"quem viu esta chave, e quando?"*. Um log que
// ninguém consegue abrir responde essa pergunta só para quem tem acesso ao
// banco — que é exatamente quem já podia ler a coluna cifrada. O aviso da tela
// de revelação ("fica registrado no histórico") também passaria a ser uma
// ameaça vazia.
// ═════════════════════════════════════════════════════════════════════════════
//
// O VOCABULÁRIO É DAQUI, não do `historico.helper.ts` compartilhado: aquele
// arquivo tem o que vale para qualquer trilha (CREATE, UPDATE, lixeira), e
// `ACOES_DA_LICENCA` / `ROTULOS_DA_LICENCA` acrescentam o que só faz sentido
// numa licença. Uma lista central com o vocabulário de todos os domínios seria
// um arquivo que nenhuma das telas lê inteiro.

interface HistoricoLicencaProps {
  eventos: EventoDaLicenca[];
  carregando: boolean;
}

/** As duas ações que merecem destaque: uma destrói valor, a outra expõe segredo. */
const ICONE: Record<string, typeof Eye> = {
  RETIRE: Flame,
  VIEW_KEY: Eye,
};

const COR_DA_ACAO: Record<string, string> = {
  RETIRE: 'text-status-danger',
  VIEW_KEY: 'text-status-warning',
};

export default function HistoricoLicenca({ eventos, carregando }: HistoricoLicencaProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando histórico…</p>;

  if (eventos.length === 0) {
    return <p className="text-text-tertiary">Nada aconteceu com esta licença ainda.</p>;
  }

  return (
    <ul className="space-y-2">
      {eventos.map((evento) => (
        <Evento key={evento.id} evento={evento} />
      ))}
    </ul>
  );
}

function Evento({ evento }: { evento: EventoDaLicenca }) {
  // A leitura do `changes` fora do JSX: o formato varia com a operação, e
  // separar diff de dado solto é regra, não marcação.
  const { mudancas, detalhes } = lerEvento(evento, ROTULOS_DA_LICENCA);
  const Icone = ICONE[evento.action] ?? History;
  const cor = COR_DA_ACAO[evento.action] ?? 'text-text-secondary';

  return (
    <li className="border border-border-sutil p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={`flex items-center gap-2 ${cor}`}>
          <Icone size={12} />
          {rotuloDaAcao(evento.action, ACOES_DA_LICENCA)}
        </span>
        <span className="text-[10px] text-text-tertiary">{momentoDoEvento(evento.createdAt)}</span>
      </div>

      {mudancas.length > 0 && (
        <ul className="space-y-1 text-[10px]">
          {mudancas.map((mudanca) => (
            <li key={mudanca.campo} className="flex flex-wrap gap-1.5" title={mudanca.cru}>
              <span className="text-text-tertiary">{mudanca.rotulo}:</span>
              <span className="text-text-tertiary line-through">{mudanca.de}</span>
              <span className="text-text-secondary">→ {mudanca.para}</span>
            </li>
          ))}
        </ul>
      )}

      {detalhes.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
          {detalhes.map((detalhe) => (
            <span key={detalhe.campo} title={detalhe.cru}>
              <span className="text-text-tertiary">{detalhe.rotulo}: </span>
              <span className="text-text-secondary">{detalhe.valor}</span>
            </span>
          ))}
        </div>
      )}

      {/* O ATOR sai da sessão (D23), e é ele que faz "quem viu esta chave?" ter
          resposta. Id curto pelo mesmo motivo do `valorLegivel`: o nome de
          quem operou pode ter mudado desde então, e resolvê-lo aqui exigiria
          guardar a história da tabela de usuários. */}
      <p className="text-[10px] text-text-tertiary">
        {evento.actorId ? `por ${evento.actorId.slice(0, 8)}…` : 'sem autor registrado'}
      </p>
    </li>
  );
}
