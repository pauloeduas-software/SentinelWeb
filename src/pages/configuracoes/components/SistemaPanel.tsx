import { useState } from 'react';
import { Save } from 'lucide-react';
import {
  FORMATOS_DE_DATA,
  type ConfiguracaoDoSistema, type FormatoDeData,
} from '../../../domain/shared/settings.types';

// A ABA *SISTEMA* (F10, Etapa A) — formato de número, data e moeda.
//
// TINHA um terceiro grupo, a retenção do backup; ele saiu com o backup (D156),
// porque campo que configura uma rotina que não existe é um campo que mente.
//
// POR QUE ELA FICA AQUI, e não numa tela nova: `/configuracoes` já é a tela das
// SETE tabelas de catálogo, dirigida por spec. Esta aba é a oitava, e é a
// primeira que não é tabela — o que ela edita é a LINHA ÚNICA do `AppSetting`.
// É a mesma escolha que pôs os botões da descoberta ao lado do painel de
// cobertura (F7) e a central de alertas dentro de `/relatorios` (F8):
// configuração mora ao lado do que ela muda.
//
// O QUE ELA NÃO OFERECE, de propósito: `timezone`, limiares de alerta e os
// botões da descoberta. Eles são do MESMO registro e têm tela própria, do lado
// dos números que explicam cada um. Juntar tudo aqui faria uma tela de
// dezesseis campos sem nada em comum além da tabela em que moram.

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';
const CAMPO = 'bg-bg-base border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary w-full';
const AJUDA = 'text-[10px] text-text-tertiary block leading-relaxed';

/** As moedas que uma operação brasileira encontra. O servidor aceita as 162 do Intl. */
const MOEDAS = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'MXN', 'PYG', 'UYU'] as const;

/** Os idiomas que a interface tem texto para acompanhar hoje. */
const IDIOMAS = [
  { valor: 'pt-BR', rotulo: 'Português (Brasil)' },
  { valor: 'en-US', rotulo: 'English (US)' },
  { valor: 'es-ES', rotulo: 'Español' },
] as const;

interface Props {
  configuracao: ConfiguracaoDoSistema | undefined;
  carregando: boolean;
  salvando: boolean;
  erro: string | null;
  onSalvar: (dados: Partial<ConfiguracaoDoSistema>) => void;
}

/**
 * A ASSINATURA DA CONFIGURAÇÃO — a `key` do formulário (D119).
 *
 * O rascunho é semeado com o que o servidor respondeu, e semear estado a partir
 * de consulta assíncrona NÃO se faz com `setState` dentro de `useEffect`: isso
 * encadeia renders e o lint desta casa reprova, com razão. O jeito do projeto é
 * estado inicial preguiçoso + REMONTAR quando o servidor muda.
 *
 * O efeito colateral é o certo: salvar invalida a consulta, o servidor responde
 * o que ACEITOU, a assinatura muda e o formulário reexibe o valor gravado — não
 * o que foi digitado. Quem mandou uma moeda inexistente e levou 422 vê o código
 * que continua valendo, em vez de um campo mentindo que a mudança pegou.
 */
function assinatura(c: ConfiguracaoDoSistema): string {
  return [c.locale, c.dateFormat, c.currency].join('·');
}

function Formulario({ configuracao, salvando, onSalvar }: {
  configuracao: ConfiguracaoDoSistema;
  salvando: boolean;
  onSalvar: (dados: Partial<ConfiguracaoDoSistema>) => void;
}) {
  const [locale, setLocale] = useState(() => configuracao.locale);
  const [dateFormat, setDateFormat] = useState<FormatoDeData>(() => configuracao.dateFormat);
  const [currency, setCurrency] = useState(() => configuracao.currency);

  const handleSalvar = () => {
    onSalvar({
      locale,
      dateFormat,
      currency,
      // `Number` e não `parseInt`: campo vazio vira `0`, que o servidor recusa
      // com a mensagem certa ("mínimo de 1") em vez de virar `NaN` e subir como
      // 422 sobre um campo que a pessoa nem sabe que mandou.
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className={ROTULO}>Idioma e região</span>
          <select value={locale} onChange={(evento) => setLocale(evento.target.value)} className={CAMPO}>
            {IDIOMAS.map((idioma) => (
              <option key={idioma.valor} value={idioma.valor}>{idioma.rotulo}</option>
            ))}
          </select>
          <span className={AJUDA}>Decide como número e moeda são escritos na tela.</span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Moeda</span>
          <select value={currency} onChange={(evento) => setCurrency(evento.target.value)} className={CAMPO}>
            {MOEDAS.map((moeda) => <option key={moeda} value={moeda}>{moeda}</option>)}
          </select>
          <span className={AJUDA}>Custo de compra, valor contábil e custo de manutenção.</span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Formato de data</span>
          <select
            value={dateFormat}
            onChange={(evento) => setDateFormat(evento.target.value as FormatoDeData)}
            className={CAMPO}
          >
            {FORMATOS_DE_DATA.map((formato) => <option key={formato} value={formato}>{formato}</option>)}
          </select>
          <span className={AJUDA}>Só a EXIBIÇÃO: decide como a tela escreve as datas.</span>
        </label>

      </div>

      <button
        type="button"
        disabled={salvando}
        onClick={handleSalvar}
        className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
      >
        <Save size={12} /> {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}

export default function SistemaPanel({
  configuracao, carregando, salvando, erro, onSalvar,
}: Props) {
  if (carregando || !configuracao) {
    return (
      <div className="border border-border-sutil p-6 font-mono text-xs text-text-tertiary">
        Carregando configuração…
      </div>
    );
  }

  return (
    <div className="border border-border-sutil p-4 md:p-6 space-y-8 font-mono">
      {erro && (
        <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {erro}
        </p>
      )}

      <Formulario
        key={assinatura(configuracao)}
        configuracao={configuracao}
        salvando={salvando}
        onSalvar={onSalvar}
      />

    </div>
  );
}
