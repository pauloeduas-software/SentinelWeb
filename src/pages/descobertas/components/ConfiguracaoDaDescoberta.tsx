import { useState } from 'react';
import { Save, Settings2 } from 'lucide-react';
import type {
  ConfiguracaoDaDescoberta as Configuracao, DiscoveryMode,
} from '../../../domain/shared/reconciliation.types';

// ═════════════════════════════════════════════════════════════════════════════
// OS BOTÕES DA DESCOBERTA — e até aqui eles não existiam em tela nenhuma.
//
// As colunas estavam no `AppSetting` desde a Etapa B, a rota
// `PUT /api/settings/discovery` estava pronta com zod e tetos, o hook estava
// escrito — e a página nunca desenhou nada disso. Configuração sem tela é a
// mesma coisa que configuração que não funciona: quem quer parar de receber
// propostas sobre máquina não cadastrada não tem onde clicar.
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  configuracao: Configuracao | undefined;
  /**
   * Gravar é `ADMIN` no servidor. Sem ele o painel continua abrindo — saber POR
   * QUE a fila está como está vale para todos —, mas só para ler: sem os botões
   * de modo e sem Salvar, que levariam 403.
   */
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (dados: Partial<Configuracao>) => void;
}

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';
const CAMPO = 'bg-bg-base border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary w-full';

/** Os três modos, com o que cada um faz escrito onde a pessoa decide (D51/D112). */
const MODOS: { valor: DiscoveryMode; rotulo: string; explicacao: string; cor: string }[] = [
  {
    valor: 'OFF',
    rotulo: 'Desligado',
    explicacao: 'Nenhuma proposta sobre máquina sem cadastro. A fila para de encher, e o painel de cobertura continua contando.',
    cor: 'text-text-tertiary',
  },
  {
    valor: 'SUGGEST',
    rotulo: 'Sugerir',
    explicacao: 'O padrão. O sistema propõe e uma pessoa decide. Nada entra no cadastro sozinho.',
    cor: 'text-status-success',
  },
  {
    valor: 'ON',
    rotulo: 'Vincular sozinho',
    explicacao: 'Série ou UUID batendo com UM único ativo vira vínculo sem perguntar. Continua não criando ativo nem mexendo em posse sozinho.',
    cor: 'text-status-warning',
  },
];

/**
 * A ASSINATURA DA CONFIGURAÇÃO — a `key` do formulário.
 *
 * O rascunho dos dois campos digitáveis é semeado com o que o servidor
 * respondeu, e semear estado a partir de uma consulta assíncrona NÃO se faz com
 * `setState` dentro de `useEffect`: isso encadeia renders e o lint desta casa
 * reprova, com razão. O jeito que o projeto usa (`CatalogFormModal`) é estado
 * inicial PREGUIÇOSO — e para ele valer quando o dado chega depois, o formulário
 * precisa REMONTAR. É o que esta chave faz.
 *
 * O efeito colateral é o certo: salvar invalida a consulta, o servidor responde
 * o que ele aceitou, a assinatura muda e o formulário reexibe o valor GRAVADO —
 * não o que foi digitado. Quem digitou 0 em `ghostDays` e levou 422 vê o número
 * que continua valendo, em vez de um campo mentindo que a mudança pegou.
 */
function assinatura(configuracao: Configuracao): string {
  return [configuracao.ghostDays, configuracao.shadowHours].join('·');
}

interface FormularioProps {
  configuracao: Configuracao;
  salvando: boolean;
  onSalvar: (dados: Partial<Configuracao>) => void;
}

/** Os dois campos digitáveis. Remonta quando o servidor muda (ver `assinatura`). */
function Formulario({ configuracao, salvando, onSalvar }: FormularioProps) {
  const [ghostDays, setGhostDays] = useState(() => String(configuracao.ghostDays));
  const [shadowHours, setShadowHours] = useState(() => String(configuracao.shadowHours));

  const handleSalvar = () => {
    // `Number` e não `parseInt`: campo vazio vira `0`, que o zod do servidor
    // recusa com a mensagem certa ("mínimo de 1") em vez de virar `NaN` e subir
    // como 422 sobre um campo que a pessoa nem sabe que mandou.
    onSalvar({
      ghostDays: Number(ghostDays),
      shadowHours: Number(shadowHours),
    });
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className={ROTULO}>Dias para virar fantasma</span>
          <input
            type="number" min={1} max={365} value={ghostDays}
            onChange={(evento) => setGhostDays(evento.target.value)}
            className={CAMPO}
          />
          <span className="text-[10px] text-text-tertiary block leading-relaxed">
            Ativo cujo agente não dá sinal há mais que isso entra na conta de fantasmas.
          </span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Horas para virar Shadow IT</span>
          <input
            type="number" min={1} max={720} value={shadowHours}
            onChange={(evento) => setShadowHours(evento.target.value)}
            className={CAMPO}
          />
          <span className="text-[10px] text-text-tertiary block leading-relaxed">
            Máquina sem cadastro vista há mais que isso e ainda sem triagem.
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
    </>
  );
}

export default function ConfiguracaoDaDescoberta({ configuracao, podeEditar, salvando, onSalvar }: Props) {
  const [aberta, setAberta] = useState(false);

  if (!configuracao) return null;

  const modoAtual = MODOS.find((modo) => modo.valor === configuracao.discoveryMode) ?? MODOS[1];

  return (
    <div className="border border-border-sutil mb-4">
      <button
        type="button"
        onClick={() => setAberta((estava) => !estava)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-bg-base/50 transition-colors"
      >
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
          <Settings2 size={12} /> Descoberta
        </span>
        <span className="font-mono text-[10px] flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
          <span className={modoAtual.cor}>{modoAtual.rotulo}</span>
          <span className="text-text-tertiary">fantasma em {configuracao.ghostDays}d</span>
          <span className="text-text-tertiary">shadow em {configuracao.shadowHours}h</span>
        </span>
      </button>

      {aberta && (
        <div className="px-4 pb-4 pt-2 border-t border-border-sutil space-y-5 font-mono text-xs">

          {/* O MODO — clique que salva na hora, sem passar por rascunho: é um
              interruptor, e interruptor que precisa de "salvar" depois não
              parece ligado nem desligado. */}
          <div className="space-y-2">
            <span className={ROTULO}>O que fazer com máquina que aparece sem cadastro</span>
            {podeEditar ? (
              <div className="flex flex-wrap gap-1">
                {MODOS.map((modo) => (
                  <button
                    key={modo.valor}
                    type="button"
                    disabled={salvando}
                    onClick={() => onSalvar({ discoveryMode: modo.valor })}
                    className={`px-3 py-1.5 text-[10px] uppercase tracking-widest border transition-colors disabled:opacity-40 ${
                      configuracao.discoveryMode === modo.valor
                        ? 'border-text-primary text-text-primary'
                        : 'border-border-sutil text-text-tertiary hover:text-text-primary'
                    }`}
                  >
                    {modo.rotulo}
                  </button>
                ))}
              </div>
            ) : (
              <p className={`text-[10px] uppercase tracking-widest ${modoAtual.cor}`}>{modoAtual.rotulo}</p>
            )}
            <p className="text-[10px] text-text-tertiary leading-relaxed max-w-2xl">
              {modoAtual.explicacao}
            </p>
            {configuracao.discoveryMode === 'ON' && (
              // O AVISO É DA DECISÃO, não do formulário (D51): em `ON`, a
              // primeira VM de teste que casar por série vira vínculo sem
              // ninguém olhar. É a única opção desta tela cujo erro é silencioso.
              <p className="text-[10px] text-status-warning leading-relaxed max-w-2xl">
                Em “vincular sozinho”, um vínculo errado entra no cadastro sem ninguém revisar —
                e quem abrir a tela do ativo vai ler o vínculo como fato. Desfazer é o botão
                “Desvincular” na aba Máquina.
              </p>
            )}
          </div>

          {podeEditar ? (
            <Formulario
              key={assinatura(configuracao)}
              configuracao={configuracao}
              salvando={salvando}
              onSalvar={onSalvar}
            />
          ) : (
            // Os dois prazos já estão no cabeçalho do painel; aqui só o porquê
            // de não haver campo para mudá-los.
            <p className="text-[10px] text-text-tertiary leading-relaxed max-w-2xl">
              Fantasma em {configuracao.ghostDays} dias, Shadow IT em {configuracao.shadowHours} horas.
              Só um administrador muda o modo e os prazos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
