import { FileUp, Upload } from 'lucide-react';
import { useRef } from 'react';
import MapeamentoForm from './components/MapeamentoForm';
import RelatorioDoImport from './components/RelatorioDoImport';
import { useImportacao } from './hooks/useImportacao';
import type { AlvoDeImport } from '../../domain/shared/import.types';

// A IMPORTAÇÃO DE CSV (docs/FASE-10-PLANO-ITAM.md, Etapa D).
//
// TELA PRÓPRIA, e não um botão dentro de Ativos: ela importa TRÊS coisas
// (ativos, pessoas e ocupação de posto) e o fluxo tem três passos com estado
// entre eles. Como botão, o passo do meio — o mapeamento — não teria onde
// morar.
//
// O NOME DA ROTA É O SUBSTANTIVO DO QUE A TELA FAZ: `/importacao`.

const ALVOS: { id: AlvoDeImport; rotulo: string; descricao: string }[] = [
  {
    id: 'ASSETS',
    rotulo: 'Ativos',
    descricao: 'Equipamento com etiqueta e série. A coluna Responsável vira uma ENTREGA, com a data '
      + 'que o arquivo trouxer — nunca um campo do ativo.',
  },
  {
    id: 'USERS',
    rotulo: 'Pessoas',
    descricao: 'O quadro de colaboradores. A chave é o e-mail: nome não identifica ninguém.',
  },
  {
    id: 'OCCUPANTS',
    rotulo: 'Ocupação de posto',
    descricao: 'Quem ocupa qual mesa, com turno. É a forma prática de dizer quem responde por '
      + 'trezentos equipamentos de uma vez — e por isso é a importação mais perigosa das três.',
  },
];

export default function ImportacaoPage() {
  const estado = useImportacao();
  const campoDeArquivo = useRef<HTMLInputElement>(null);
  const alvoAtual = ALVOS.find((alvo) => alvo.id === estado.target)!;

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="mb-6">
        <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Importação</h2>
        <p className="text-xs text-text-tertiary mt-2 font-mono max-w-3xl leading-relaxed">
          Duas etapas, sempre: o arquivo é SIMULADO e você vê linha por linha o que vai acontecer;
          só então ele é aplicado. Nada entra no inventário antes disso.
        </p>
      </div>

      <div className="flex flex-wrap border border-border-sutil font-mono text-xs mb-4">
        {ALVOS.map((alvo) => (
          <button
            key={alvo.id}
            type="button"
            onClick={() => estado.trocarAlvo(alvo.id)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              estado.target === alvo.id
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {alvo.rotulo}
          </button>
        ))}
      </div>

      <p className="text-xs text-text-tertiary font-mono mb-4 max-w-3xl leading-relaxed">
        {alvoAtual.descricao}
      </p>

      {estado.etapa === 'arquivo' && (
        <div className="border border-border-sutil p-6 font-mono space-y-4">
          <input
            ref={campoDeArquivo}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void estado.escolherArquivo(arquivo);
              // Zera: escolher o MESMO arquivo de novo precisa disparar outro
              // `change`, e sem isto o segundo clique não faz nada.
              evento.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => campoDeArquivo.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors"
          >
            <Upload size={12} /> Escolher arquivo CSV
          </button>

          <div className="flex items-start gap-2 text-[10px] text-text-tertiary leading-relaxed max-w-2xl">
            <FileUp size={12} className="shrink-0 mt-0.5" />
            <span>
              O arquivo precisa estar em <strong className="text-text-secondary">UTF-8</strong> — no
              Excel, "Salvar como" → "CSV UTF-8". O separador é detectado sozinho (<code>;</code>,
              <code>,</code>, tabulação ou <code>|</code>). Até 20 mil linhas por importação.{' '}
              <a href={estado.urlDoModelo} download className="text-status-info hover:underline">
                Baixe o modelo
              </a>{' '}
              para ver os títulos que o sistema reconhece.
            </span>
          </div>

          {estado.erroLocal && (
            <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
              {estado.erroLocal}
            </p>
          )}
        </div>
      )}

      {estado.etapa === 'mapa' && estado.arquivo && (
        <MapeamentoForm
          arquivo={estado.arquivo}
          cabecalhos={estado.cabecalhos}
          delimitador={estado.delimitador}
          campos={estado.campos}
          colunas={estado.colunas}
          chave={estado.chave}
          podeSimular={estado.podeSimular}
          simulando={estado.simulando}
          erro={estado.erroDaSimulacao}
          urlDoModelo={estado.urlDoModelo}
          onMapear={estado.mapear}
          onChave={estado.setChave}
          onSimular={() => void estado.handleSimular()}
        />
      )}

      {estado.etapa === 'relatorio' && estado.importacao && (
        <RelatorioDoImport
          importacao={estado.importacao}
          linhas={estado.linhas}
          total={estado.totalDeLinhas}
          filtro={estado.filtro}
          pagina={estado.pagina}
          linhasPorPagina={estado.linhasPorPagina}
          aplicando={estado.aplicando}
          erro={estado.erroDoApply}
          onFiltro={estado.trocarFiltro}
          onPagina={estado.setPagina}
          onAplicar={() => void estado.handleAplicar()}
          onRecomecar={estado.recomecar}
        />
      )}
    </div>
  );
}
