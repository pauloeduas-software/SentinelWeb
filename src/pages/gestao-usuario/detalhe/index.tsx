import { ArrowLeft, History, MapPin, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import HistoryPanel from './components/HistoryPanel';
import { useUserDetail } from './hooks/useUserDetail';
import { formatarData } from '../../helpers/format.helper';
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
  } = useUserDetail();

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
            <ArrowLeft size={12} /> Colaboradores
          </Link>
          <h2 className="flex items-center gap-3 text-xl font-mono text-text-primary uppercase tracking-widest">
            <Iniciais nome={user.name} tamanho="grande" />
            {user.name}
          </h2>
          <div className="flex items-center gap-4 font-mono text-xs text-text-tertiary flex-wrap">
            <span>{user.email}</span>
            <span>{user.department?.name || 'sem departamento'}</span>
            {user.terminatedAt ? (
              // O desligamento é a primeira coisa que a tela precisa dizer:
              // todo número abaixo dele tem que ser lido como histórico.
              <span className="flex items-center gap-2 text-status-warning">
                <UserX size={12} /> desligado em {formatarData(user.terminatedAt)}
              </span>
            ) : (
              <span className="text-status-success">ativo</span>
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
