import { useState } from 'react';
import { ArrowLeft, Boxes, History, MapPin, Undo2, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import HistoryPanel from './components/HistoryPanel';
import { useUserDetail } from './hooks/useUserDetail';
import { formatarData } from '../../helpers/format.helper';
import { momentoDoEvento } from '../../helpers/historico.helper';
import Iniciais from '../../components/Iniciais';

// PERFIL DO COLABORADOR — quem é a pessoa, os POSTOS que ela ocupa e o
// HISTÓRICO dela (docs/referencia/modelo-de-posse.md).
//
// Os postos aparecem inclusive quando não têm ativo nenhum entregue: é uma
// ocupação aberta, e é ela que o 409 do `DELETE` conta.
//
// O histórico vem embaixo, e a ordem é o argumento: a lista de cima diz o que
// ESTÁ, o histórico diz o que FOI. Um ativo devolvido mês passado não aparece
// na de cima, e é ele que responde "já teve um notebook antes?".

const CELULA = 'px-6 py-3';
const CABECALHO = 'px-6 py-3 font-normal';

export default function UserDetailPage() {
  const {
    user, ocupacoes, carregando, erro,
    historico, totalDoHistorico, carregandoHistorico,
    handleDevolverItem, devolvendoItem,
  } = useUserDetail();

  // O ERRO DA DEVOLUÇÃO mora na PÁGINA, como na ficha do posto: a mutação
  // propaga a rejeição (docs/referencia/arquitetura.md) e quem a mostra é quem
  // chamou. Sem este `catch`, o 409 de "unidade já devolvida" — duas abas
  // nesta mesma ficha — viraria uma rejeição não tratada, e o clique não
  // diria nada.
  const [erroDaDevolucao, setErroDaDevolucao] = useState('');

  const devolver = async (movementId: string) => {
    setErroDaDevolucao('');
    try {
      await handleDevolverItem(movementId);
    } catch (falha) {
      setErroDaDevolucao((falha as Error).message);
    }
  };

  if (carregando) {
    return <p className="font-mono text-xs text-text-tertiary">Carregando colaborador...</p>;
  }

  if (erro || !user) {
    return (
      <div className="font-mono text-xs space-y-4">
        <p className="text-status-danger">{erro ?? 'Colaborador não encontrado.'}</p>
        <Link to="/users" className="text-text-tertiary hover:text-text-primary flex items-center gap-2">
          <ArrowLeft size={14} /> Voltar para a lista
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-8">

      <div className="flex justify-between items-end gap-6 flex-wrap">
        <div className="space-y-2">
          <Link to="/users" className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary flex items-center gap-2">
            <ArrowLeft size={12} /> Usuários
          </Link>
          <h2 className="flex items-center gap-3 text-xl font-mono text-text-primary uppercase tracking-widest">
            <Iniciais nome={user.name} tamanho="grande" />
            {user.name}
          </h2>
          <div className="flex items-center gap-4 font-mono text-xs text-text-tertiary flex-wrap">
            <span>{user.email}</span>
            {user.isActive ? (
              <span className="text-status-success">ativo</span>
            ) : (
              // Estar desativado é a primeira coisa que a tela precisa dizer: todo
              // número abaixo tem que ser lido como histórico. Quando e por
              // quem está no histórico, logo embaixo.
              <span className="flex items-center gap-2 text-status-warning">
                <UserX size={12} /> desativado
              </span>
            )}
          </div>
        </div>

      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <MapPin size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Postos ocupados <span className="text-text-tertiary">({ocupacoes.length})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          Aparecem aqui inclusive os postos sem ativo nenhum — é uma ocupação aberta, e o
          409 do DELETE a conta.
        </p>

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Posto</th>
                <th className={CABECALHO}>Turno</th>
                <th className={CABECALHO}>Desde</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {ocupacoes.map((ocupacao) => (
                <tr key={ocupacao.id} className="hover:bg-bg-base transition-colors">
                  <td className={CELULA}>{ocupacao.location?.name ?? '—'}</td>
                  <td className={CELULA}>{ocupacao.shift || '—'}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarData(ocupacao.startedAt)}</td>
                </tr>
              ))}
              {ocupacoes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-10 text-center text-text-tertiary">
                    Não ocupa nenhum posto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <Boxes size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Itens de estoque com esta pessoa <span className="text-text-tertiary">({user.itens.length})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          Unidades de estoque no NOME dela — nunca as do posto que ocupa. É o que o 409 do
          excluir conta como "itens de estoque" e o que ela leva se saísse da empresa hoje.
        </p>

        {erroDaDevolucao && (
          <div className="p-3 mb-3 bg-status-danger/10 text-status-danger border border-status-danger/20 font-mono text-xs" role="alert">
            {erroDaDevolucao}
          </div>
        )}

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Item</th>
                <th className={CABECALHO}>Categoria</th>
                <th className={CABECALHO}>Desde</th>
                <th className={`${CABECALHO} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {user.itens.map((unidade) => (
                <tr key={unidade.id} className="hover:bg-bg-base transition-colors">
                  <td className={CELULA}>
                    {unidade.item.name}
                    {unidade.item.deletedAt && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-text-tertiary">na lixeira</span>
                    )}
                  </td>
                  <td className={`${CELULA} text-text-tertiary`}>{unidade.item.category.name}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{momentoDoEvento(unidade.createdAt)}</td>
                  <td className={`${CELULA} text-right`}>
                    <button
                      type="button"
                      disabled={devolvendoItem}
                      onClick={() => void devolver(unidade.id)}
                      title={`Devolver ${unidade.item.name} ao estoque`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 border border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary hover:bg-bg-base disabled:opacity-30 transition-colors"
                    >
                      <Undo2 size={11} /> Devolver
                    </button>
                  </td>
                </tr>
              ))}
              {user.itens.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-text-tertiary">
                    Não está com nenhum item de estoque.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <History size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Histórico <span className="text-text-tertiary">({totalDoHistorico})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          O que aconteceu COM esta pessoa: cadastro e edições, entregas e devoluções, entradas e
          saídas de posto. O que ela fez como operadora do sistema é outro relatório.
        </p>

        <HistoryPanel eventos={historico} total={totalDoHistorico} carregando={carregandoHistorico} />
      </div>

    </div>
  );
}
