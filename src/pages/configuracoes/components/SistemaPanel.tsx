import { useRef, useState } from 'react';
import { Image, Save, Trash2, Upload } from 'lucide-react';
import {
  DELIMITADORES_DE_CSV, FORMATOS_DE_DATA,
  type ConfiguracaoDoSistema, type DelimitadorDeCsv, type FormatoDeData, type MarcaVisual,
} from '../../../domain/shared/settings.types';

// A ABA *SISTEMA* (F10, Etapa A) — marca e formato de número, data e moeda.
//
// TINHA um terceiro grupo, a retenção do backup; ele saiu com o backup (D156),
// porque campo que configura uma rotina que não existe é um campo que mente.
//
// POR QUE ELA FICA AQUI, e não numa tela nova: `/configuracoes` já é a tela das
// NOVE tabelas de catálogo, dirigida por spec. Esta aba é a décima, e é a
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

const NOME_DO_DELIMITADOR: Record<DelimitadorDeCsv, string> = {
  ';': 'Ponto e vírgula  ;',
  ',': 'Vírgula  ,',
  '|': 'Barra vertical  |',
  '\t': 'Tabulação',
};

interface Props {
  configuracao: ConfiguracaoDoSistema | undefined;
  carregando: boolean;
  salvando: boolean;
  erro: string | null;
  urlDaLogo: string | null;
  urlDoFavicon: string | null;
  onSalvar: (dados: Partial<ConfiguracaoDoSistema>) => void;
  onSubirMarca: (marca: MarcaVisual, arquivo: File) => void;
  onLimparMarca: (marca: MarcaVisual) => void;
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
  return [c.companyName, c.primaryColor, c.locale, c.dateFormat, c.currency, c.csvDelimiter]
    .join('·');
}

function Marca({
  titulo, ajuda, url, onSubir, onLimpar, salvando,
}: {
  titulo: string;
  ajuda: string;
  url: string | null;
  onSubir: (arquivo: File) => void;
  onLimpar: () => void;
  salvando: boolean;
}) {
  const campo = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <span className={ROTULO}>{titulo}</span>

      <div className="flex items-center gap-3">
        <div className="h-12 w-20 border border-border-sutil flex items-center justify-center bg-bg-base shrink-0">
          {url ? (
            // Sem `key` no `src`, trocar a logo não repinta: a URL é a MESMA
            // (ela aponta para a marca, não para o arquivo), e o navegador
            // serve a imagem anterior do cache dele. A rota manda `no-store`,
            // mas o `<img>` já montado não refaz o pedido sozinho.
            <img key={url} src={url} alt="" className="max-h-10 max-w-[72px] object-contain" />
          ) : (
            <Image size={14} className="text-text-tertiary" />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <input
            ref={campo}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) onSubir(arquivo);
              // Zera o campo: escolher o MESMO arquivo de novo precisa disparar
              // outro `change`, e sem isto o segundo clique não faz nada.
              evento.target.value = '';
            }}
          />

          <button
            type="button"
            disabled={salvando}
            onClick={() => campo.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 border border-border-sutil hover:border-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
          >
            <Upload size={12} /> Enviar
          </button>

          {url && (
            <button
              type="button"
              disabled={salvando}
              onClick={onLimpar}
              className="flex items-center gap-2 px-3 py-1.5 text-text-tertiary hover:text-status-danger text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
            >
              <Trash2 size={12} /> Remover
            </button>
          )}
        </div>
      </div>

      <span className={AJUDA}>{ajuda}</span>
    </div>
  );
}

function Formulario({ configuracao, salvando, onSalvar }: {
  configuracao: ConfiguracaoDoSistema;
  salvando: boolean;
  onSalvar: (dados: Partial<ConfiguracaoDoSistema>) => void;
}) {
  const [companyName, setCompanyName] = useState(() => configuracao.companyName);
  const [primaryColor, setPrimaryColor] = useState(() => configuracao.primaryColor);
  const [locale, setLocale] = useState(() => configuracao.locale);
  const [dateFormat, setDateFormat] = useState<FormatoDeData>(() => configuracao.dateFormat);
  const [currency, setCurrency] = useState(() => configuracao.currency);
  const [csvDelimiter, setCsvDelimiter] = useState<DelimitadorDeCsv>(() => configuracao.csvDelimiter);

  const handleSalvar = () => {
    onSalvar({
      companyName,
      primaryColor,
      locale,
      dateFormat,
      currency,
      csvDelimiter,
      // `Number` e não `parseInt`: campo vazio vira `0`, que o servidor recusa
      // com a mensagem certa ("mínimo de 1") em vez de virar `NaN` e subir como
      // 422 sobre um campo que a pessoa nem sabe que mandou.
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className={ROTULO}>Nome da empresa</span>
          <input
            type="text" maxLength={200} value={companyName}
            onChange={(evento) => setCompanyName(evento.target.value)}
            className={CAMPO}
          />
          <span className={AJUDA}>Aparece no cabeçalho do painel e no termo de entrega.</span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Cor de destaque</span>
          <div className="flex items-center gap-2">
            <input
              type="color" value={primaryColor}
              onChange={(evento) => setPrimaryColor(evento.target.value)}
              className="h-8 w-10 bg-bg-base border border-border-sutil p-0.5"
            />
            <input
              type="text" value={primaryColor} maxLength={7}
              onChange={(evento) => setPrimaryColor(evento.target.value)}
              className={`${CAMPO} uppercase`}
            />
          </div>
          <span className={AJUDA}>
            Em <code>#rrggbb</code>. Ela pinta o nome da empresa — e só ele, de propósito:
            a cor do texto do painel também é o fundo de todo botão, e uma marca escura ali
            deixaria botão escuro com letra escura.
          </span>
        </label>

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
          <span className={AJUDA}>
            Só a EXIBIÇÃO. O CSV sempre sai em <code>AAAA-MM-DD</code>, porque ele é a entrada
            do importador.
          </span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Delimitador do CSV</span>
          <select
            value={csvDelimiter}
            onChange={(evento) => setCsvDelimiter(evento.target.value as DelimitadorDeCsv)}
            className={CAMPO}
          >
            {DELIMITADORES_DE_CSV.map((d) => (
              <option key={d} value={d}>{NOME_DO_DELIMITADOR[d]}</option>
            ))}
          </select>
          <span className={AJUDA}>
            O Excel em português salva com <code>;</code>. Na importação o delimitador é
            DETECTADO no cabeçalho — isto aqui é o que o export escreve.
          </span>
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
  configuracao, carregando, salvando, erro, urlDaLogo, urlDoFavicon,
  onSalvar, onSubirMarca, onLimparMarca,
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

      <div className="border-t border-border-sutil pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Marca
          titulo="Logo"
          ajuda="PNG, JPG, WEBP ou GIF, até 2 MB. Sai por rota com sessão, como todo arquivo deste sistema — por isso a tela de login não a mostra."
          url={urlDaLogo}
          salvando={salvando}
          onSubir={(arquivo) => onSubirMarca('logo', arquivo)}
          onLimpar={() => onLimparMarca('logo')}
        />

        <Marca
          titulo="Favicon"
          ajuda="O ícone da aba. Quadrado e pequeno: 32×32 ou 64×64 é o que o navegador usa."
          url={urlDoFavicon}
          salvando={salvando}
          onSubir={(arquivo) => onSubirMarca('favicon', arquivo)}
          onLimpar={() => onLimparMarca('favicon')}
        />
      </div>
    </div>
  );
}
