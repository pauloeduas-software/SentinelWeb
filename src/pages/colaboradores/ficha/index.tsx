import { ArrowLeft, Boxes, History, KeyRound, MapPin, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import HistoryPanel from './components/HistoryPanel';
import { useColaborador } from './hooks/useColaborador';
import { formatarDiaDoInstante } from '../../helpers/format.helper';
import { caminhoDoItem, textoDeUnidades } from '../../helpers/estoque.helper';
import { caminhoDaLicenca, textoDaSituacao } from '../../helpers/licenca.helper';

// FICHA DO COLABORADOR — quem é a pessoa, os POSTOS que ela ocupa, o estoque e
// as licenças no nome dela, e o HISTÓRICO (docs/referencia/modelo-de-posse.md). Abre da
// página Colaboradores.
//
// Os postos aparecem inclusive quando não têm ativo nenhum entregue: é uma
// ocupação aberta, e é ela que a desativação cobra.
//
// O histórico vem embaixo, e a ordem é o argumento: a lista de cima diz o que
// ESTÁ, o histórico diz o que FOI. Um ativo devolvido mês passado não aparece
// na de cima, e é ele que responde "já teve um notebook antes?".

const CELULA = 'px-6 py-3';
const CABECALHO = 'px-6 py-3 font-normal';

/** Volta para a lista de Colaboradores. */
const VOLTAR = '/colaboradores';

export default function ColaboradorPage() {
  const {
    pessoa, ocupacoes, carregando, erro,
    historico, totalDoHistorico, carregandoHistorico,
  } = useColaborador();

  if (carregando) {
    return <p className="font-mono text-xs text-text-tertiary">Carregando colaborador...</p>;
  }

  if (erro || !pessoa) {
    return (
      <div className="font-mono text-xs space-y-4">
        <p className="text-status-danger">{erro ?? 'Colaborador não encontrado.'}</p>
        <Link to={VOLTAR} className="text-text-tertiary hover:text-text-primary flex items-center gap-2">
          <ArrowLeft size={14} /> Voltar para a lista
        </Link>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-fade-in space-y-8">

      <div className="flex justify-between items-end gap-6 flex-wrap">
        <div className="space-y-2">
          <Link to={VOLTAR} className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary flex items-center gap-2">
            <ArrowLeft size={12} /> Colaboradores
          </Link>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">
            {pessoa.name}
          </h2>
          <div className="flex items-center gap-4 font-mono text-xs text-text-tertiary flex-wrap">
            {pessoa.email && <span>{pessoa.email}</span>}
            {pessoa.isActive ? (
              <span className="text-status-success">ativo</span>
            ) : (
              // Estar desativado é a primeira coisa que a tela precisa dizer: todo
              // número abaixo tem que ser lido como histórico. Quando e por
              // quem foi desativado fica na auditoria, no banco (AB).
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
          Aparecem aqui inclusive os postos sem ativo nenhum: ocupar um posto também é
          responder por ele, e precisa ser encerrado antes de desativar a pessoa.
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
                  <td className={CELULA}>{ocupacao.workstation?.name ?? '—'}</td>
                  <td className={CELULA}>{ocupacao.shift || '—'}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarDiaDoInstante(ocupacao.startedAt)}</td>
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
            Itens de estoque com esta pessoa{' '}
            <span className="text-text-tertiary">
              ({textoDeUnidades(pessoa.itens.reduce((soma, entrega) => soma + entrega.unidades, 0))})
            </span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          Unidades de estoque no NOME dela — nunca as do posto que ocupa. É o que precisa
          voltar antes de desativá-la — pelo detalhe do item, aberto no nome dela.
        </p>

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Item</th>
                <th className={CABECALHO}>Categoria</th>
                <th className={CABECALHO}>Quantidade</th>
                <th className={CABECALHO}>Desde</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {pessoa.itens.map((entrega) => (
                <tr key={entrega.id} className="hover:bg-bg-base transition-colors">
                  <td className={CELULA}>
                    <Link to={caminhoDoItem(entrega.item.id, pessoa.name)} className="hover:underline underline-offset-2">
                      {entrega.item.name}
                    </Link>
                    {entrega.notes && (
                      <div className="text-[10px] text-text-tertiary mt-0.5">{entrega.notes}</div>
                    )}
                  </td>
                  <td className={`${CELULA} text-text-tertiary`}>{entrega.item.category.name}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{textoDeUnidades(entrega.unidades)}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarDiaDoInstante(entrega.checkoutAt)}</td>
                </tr>
              ))}
              {pessoa.itens.length === 0 && (
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
          <KeyRound size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Licenças com esta pessoa <span className="text-text-tertiary">({pessoa.licencas.length})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          Licenças entregues a ELA, como uma assinatura do Microsoft 365 — nunca as do
          computador que ela usa, que ficam na aba Licenças do ativo. É o que precisa voltar
          antes de desativá-la — pelo detalhe da licença, aberto no nome dela.
        </p>

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Licença</th>
                <th className={CABECALHO}>Categoria</th>
                <th className={CABECALHO}>Situação</th>
                <th className={CABECALHO}>Desde</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {pessoa.licencas.map((entrega) => (
                <tr key={entrega.id} className="hover:bg-bg-base transition-colors">
                  <td className={CELULA}>
                    <Link to={caminhoDaLicenca(entrega.license.id, pessoa.name)} className="hover:underline underline-offset-2">
                      {entrega.license.name}
                    </Link>
                    {entrega.checkoutNotes && (
                      <div className="text-[10px] text-text-tertiary mt-0.5">{entrega.checkoutNotes}</div>
                    )}
                  </td>
                  <td className={`${CELULA} text-text-tertiary`}>{entrega.license.category?.name ?? '—'}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{textoDaSituacao(entrega)}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarDiaDoInstante(entrega.checkoutAt)}</td>
                </tr>
              ))}
              {pessoa.licencas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-text-tertiary">
                    Não está com nenhuma licença.
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
          O que aconteceu com esta pessoa: cadastro e edições, entregas e devoluções, entradas e
          saídas de posto.
        </p>

        <HistoryPanel eventos={historico} total={totalDoHistorico} carregando={carregandoHistorico} />
      </div>

    </div>
  );
}
