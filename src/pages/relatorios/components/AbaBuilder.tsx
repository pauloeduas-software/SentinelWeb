import { useState } from 'react';
import { Play, Table2 } from 'lucide-react';
import { formatarData, formatarMoeda } from '../../helpers/format.helper';
import type { CamposDoBuilder, RespostaDoBuilder } from '../../../domain/shared/lifecycle.types';

// O RELATÓRIO MONTADO PELO USUÁRIO (F10, Etapa F — D67).
//
// O CLIENTE MANDA TOKEN, nunca nome de coluna nem SQL. A lista de tokens vem do
// SERVIDOR (`/reports/builder/fields`), e é o servidor que os troca por
// fragmentos declarados em código — token desconhecido volta 422 com a lista
// dos válidos.
//
// A COLUNA QUE JUSTIFICA A TELA É *Responsável*: ela não existe em tabela
// nenhuma. Sai da view `vw_asset_responsibles`, e é a única maneira de
// responder "quanto em equipamento cada pessoa responde" — agrupar em memória
// exigiria buscar a frota inteira, que é o que o teto de página existe para
// impedir.

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';
const CAMPO = 'bg-bg-base border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary';

/** Rótulos em português para os tokens. O servidor manda o token; o nome é da tela. */
const NOMES: Record<string, string> = {
  assetTag: 'Etiqueta',
  serial: 'Nº de série',
  name: 'Nome',
  status: 'Status',
  model: 'Modelo',
  manufacturer: 'Fabricante',
  category: 'Categoria',
  location: 'Localização',
  supplier: 'Fornecedor',
  purchaseDate: 'Data de compra',
  purchaseCost: 'Custo de compra',
  warrantyExpiresAt: 'Garantia até',
  eolDate: 'Fim de vida',
  responsavel: 'Responsável',
  responsavelEmail: 'E-mail do responsável',
  via: 'Como responde',
  posto: 'Posto',
  turno: 'Turno',
};

const PADRAO = ['assetTag', 'model', 'status', 'responsavel', 'via'];

/** Dinheiro e data saem formatados; o resto é texto. */
function celula(token: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (token === 'purchaseCost') return formatarMoeda(valor);
  if (token === 'purchaseDate' || token === 'warrantyExpiresAt' || token === 'eolDate') {
    return formatarData(valor);
  }
  return String(valor);
}

interface Props {
  campos: CamposDoBuilder | undefined;
  resultado: RespostaDoBuilder | undefined;
  gerando: boolean;
  erro: string | null;
  onGerar: (pedido: { columns: string[]; agruparPor?: string }) => void;
}

export default function AbaBuilder({ campos, resultado, gerando, erro, onGerar }: Props) {
  const [colunas, setColunas] = useState<string[]>(PADRAO);
  const [agruparPor, setAgruparPor] = useState('');

  const alternar = (token: string) => {
    setColunas((atual) =>
      atual.includes(token) ? atual.filter((item) => item !== token) : [...atual, token]);
  };

  return (
    <div className="space-y-4">
      <div className="border border-border-sutil p-4 space-y-4">
        <div className="space-y-2">
          <span className={ROTULO}>Colunas</span>
          <div className="flex flex-wrap gap-2">
            {(campos?.colunas ?? []).map((token) => {
              const marcada = colunas.includes(token);
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => alternar(token)}
                  className={`px-3 py-1.5 border text-[10px] uppercase tracking-widest transition-colors ${
                    marcada
                      ? 'border-text-secondary text-text-primary bg-bg-base'
                      : 'border-border-sutil text-text-tertiary hover:text-text-primary'
                  }`}
                >
                  {NOMES[token] ?? token}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 block">
            <span className={ROTULO}>Agrupar por</span>
            <select
              value={agruparPor}
              onChange={(evento) => setAgruparPor(evento.target.value)}
              className={`${CAMPO} min-w-[14rem]`}
            >
              <option value="">— não agrupar —</option>
              {(campos?.agrupaveis ?? []).map((token) => (
                <option key={token} value={token}>{NOMES[token] ?? token}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={gerando || colunas.length === 0}
            onClick={() => onGerar({ columns: colunas, ...(agruparPor ? { agruparPor } : {}) })}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
          >
            <Play size={12} /> {gerando ? 'Gerando…' : 'Gerar'}
          </button>
        </div>

        <p className="text-[10px] text-text-tertiary leading-relaxed max-w-3xl">
          <strong className="text-text-secondary">Responsável</strong>,{' '}
          <strong className="text-text-secondary">Como responde</strong>,{' '}
          <strong className="text-text-secondary">Posto</strong> e{' '}
          <strong className="text-text-secondary">Turno</strong> não são colunas de tabela nenhuma:
          elas são derivadas da entrega e da ocupação do posto. Um ativo entregue a uma mesa com
          duas pessoas aparece DUAS vezes na listagem — uma por responsável —, e é isso que torna
          "o que cada pessoa responde" respondível. Agrupando, cada ativo é contado uma vez só.
        </p>
      </div>

      {erro && (
        <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger font-mono">
          {erro}
        </p>
      )}

      {resultado && resultado.agruparPor && (
        <div className="border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3 font-normal">{NOMES[resultado.agruparPor] ?? resultado.agruparPor}</th>
                <th className="px-4 py-3 font-normal text-right">Ativos</th>
                <th className="px-4 py-3 font-normal text-right">Custo total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-sutil/50">
              {resultado.grupos.map((grupo) => (
                <tr key={grupo.grupo ?? 'sem'} className="hover:bg-bg-base transition-colors">
                  <td className="px-4 py-3 text-text-primary">{grupo.grupo ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{grupo.ativos}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatarMoeda(grupo.custoTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resultado && !resultado.agruparPor && (
        <div className="border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                {resultado.columns.map((coluna) => (
                  <th key={coluna.token} className="px-4 py-3 font-normal">{coluna.rotulo}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-sutil/50">
              {resultado.linhas.map((linha, indice) => (
                <tr key={indice} className="hover:bg-bg-base transition-colors">
                  {resultado.columns.map((coluna) => (
                    <td key={coluna.token} className="px-4 py-3 text-text-secondary">
                      {celula(coluna.token, linha[coluna.token])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!resultado && !gerando && (
        <p className="flex items-center gap-2 border border-border-sutil px-4 py-8 justify-center text-xs text-text-tertiary font-mono">
          <Table2 size={14} /> Escolha as colunas e clique em gerar.
        </p>
      )}
    </div>
  );
}
