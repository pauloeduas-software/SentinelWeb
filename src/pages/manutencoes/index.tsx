import { Plus } from 'lucide-react';
import ListToolbar from '../components/ListToolbar';
import EncerrarModal from './components/EncerrarModal';
import ManutencaoFormModal from './components/ManutencaoFormModal';
import ManutencaoTable from './components/ManutencaoTable';
import { useManutencoes } from './hooks/useManutencoes';
import { TIPOS_DE_MANUTENCAO } from '../../domain/shared/lifecycle.types';
import type { SituacaoDeManutencao, TipoDeManutencao } from '../../domain/shared/lifecycle.types';
import { formatarMoeda } from '../helpers/format.helper';

// AS MANUTENÇÕES (docs/FASE-8-PLANO-ITAM.md, Etapa A).
//
// O que a manutenção tem e o ativo não tem é HISTÓRICO DE SERVIÇO: a pergunta que
// esta tela responde é "quanto este parque custa para manter, e o que ainda está
// aberto". A segunda metade é operacional, a primeira aparece em renovação de
// contrato.
//
// Markup e mais nada: estado e chamadas ficam no `useManutencoes`
// (docs/ARQUITETURA.md).

const SITUACOES: { valor: SituacaoDeManutencao; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'abertas', rotulo: 'Em aberto' },
  { valor: 'encerradas', rotulo: 'Encerradas' },
];

export default function ManutencoesPage() {
  const {
    manutencoes, resumo, total, page, perPage, setPage,
    search, changeSearch, situacao, changeSituacao, type, changeType,
    modal, aberta, abrir, fechar,
    handleCriar, handleEditar, handleEncerrar, handleExcluir,
  } = useManutencoes();

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Manutenções</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl leading-relaxed">
            O histórico de serviço do parque: o que foi feito, por quem, quanto custou e se saiu
            na garantia.
            <span className="text-text-secondary"> Abrir manutenção não muda o status do ativo.</span>
          </p>
        </div>
        <button
          onClick={() => abrir('criar')}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
        >
          <Plus size={14} /> Nova manutenção
        </button>
      </div>

      {/* Os totais são do RECORTE, não da página: filtrar por REPARO muda os três
          números. Somar as linhas visíveis daria o custo de quinze manutenções e
          mudaria ao virar a página. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 font-mono">
        <Indicador rotulo="Custo acumulado" valor={formatarMoeda(resumo.custoTotal)} />
        <Indicador
          rotulo="Em aberto"
          valor={String(resumo.emAberto)}
          cor={resumo.emAberto > 0 ? '#f59e0b' : undefined}
        />
        <Indicador rotulo="Na garantia" valor={String(resumo.naGarantia)} cor="#22c55e" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4 font-mono text-xs">
        <div className="flex border border-border-sutil">
          {SITUACOES.map((item) => (
            <button
              key={item.valor}
              type="button"
              onClick={() => changeSituacao(item.valor)}
              className={`px-4 py-2 uppercase tracking-widest transition-colors ${
                item.valor === situacao
                  ? 'bg-text-primary text-bg-base'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
              }`}
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        <select
          value={type}
          onChange={(evento) => changeType(evento.target.value as TipoDeManutencao | '')}
          className="px-3 py-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors uppercase tracking-widest text-[10px]"
        >
          <option value="">Todos os tipos</option>
          {TIPOS_DE_MANUTENCAO.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
          ))}
        </select>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por título, etiqueta do ativo, fornecedor ou observação..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <ManutencaoTable
        manutencoes={manutencoes}
        onEditar={(manutencao) => abrir('editar', manutencao)}
        onEncerrar={(manutencao) => abrir('encerrar', manutencao)}
        onExcluir={(manutencao) => void handleExcluir(manutencao)}
        vazio={
          search ? (
            <span>Nenhuma manutenção encontrada para "{search}".</span>
          ) : situacao === 'abertas' ? (
            <span>Nenhuma manutenção em aberto. O parque está sem pendência de serviço.</span>
          ) : (
            <>
              <span>Nenhuma manutenção registrada.</span>
              <span className="mt-4 text-[10px] max-w-md text-center leading-relaxed">
                Reparo, upgrade, calibração e contrato de suporte entram aqui. O histórico é o que
                responde "vale a pena consertar de novo?" — e o custo acumulado é o que aparece
                numa renovação de contrato.
              </span>
            </>
          )
        }
      />

      {modal === 'criar' && (
        <ManutencaoFormModal
          manutencao={null}
          onClose={fechar}
          onSubmit={handleCriar}
        />
      )}

      {modal === 'editar' && aberta && (
        <ManutencaoFormModal
          manutencao={aberta}
          assetIdFixo={aberta.assetId}
          onClose={fechar}
          onSubmit={(_assetId, dados) => handleEditar(dados)}
        />
      )}

      {modal === 'encerrar' && aberta && (
        <EncerrarModal manutencao={aberta} onClose={fechar} onSubmit={handleEncerrar} />
      )}
    </div>
  );
}

interface IndicadorProps {
  rotulo: string;
  valor: string;
  cor?: string;
}

function Indicador({ rotulo, valor, cor }: IndicadorProps) {
  return (
    <div className="border border-border-sutil bg-surface-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-text-tertiary">{rotulo}</div>
      <div className="text-lg mt-1" style={cor ? { color: cor } : undefined}>{valor}</div>
    </div>
  );
}
