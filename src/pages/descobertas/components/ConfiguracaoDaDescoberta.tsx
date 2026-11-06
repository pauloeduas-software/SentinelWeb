import { useState } from 'react';
import { ChevronDown, Save, Settings2 } from 'lucide-react';
import { Aviso } from '../../../components/ui/aviso';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Campo } from '../../../components/ui/campo';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Segmentado } from '../../../components/ui/segmentado';
import { cn } from '../../../helpers/cn.helper';
import type {
  ConfiguracaoDaDescoberta as Configuracao, DiscoveryMode,
} from '../../../types/reconciliation.types';

// ═════════════════════════════════════════════════════════════════════════════
// OS BOTÕES DA DESCOBERTA — e até aqui eles não existiam em tela nenhuma.
//
// As colunas já estavam no `AppSetting`, a rota
// `PUT /api/settings/discovery` estava pronta com zod e tetos, o hook estava
// escrito — e a página nunca desenhou nada disso. Configuração sem tela é a
// mesma coisa que configuração que não funciona: quem quer parar de receber
// propostas sobre máquina não cadastrada não tem onde clicar.
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  configuracao: Configuracao | undefined;
  erro: string | null;
  /**
   * Gravar é `SUPERVISOR` no servidor. Sem ele o painel continua abrindo — saber POR
   * QUE a fila está como está vale para todos —, mas só para ler: sem os botões
   * de modo e sem Salvar, que levariam 403.
   */
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (dados: Partial<Configuracao>) => void;
}

/** Os três modos, com o que cada um faz escrito onde a pessoa decide (D51/D112). */
const MODOS: { valor: DiscoveryMode; rotulo: string; explicacao: string; tom: 'neutro' | 'sucesso' | 'aviso' }[] = [
  {
    valor: 'OFF',
    rotulo: 'Desligado',
    explicacao: 'Nenhuma proposta sobre máquina sem cadastro. A fila para de encher, e o painel de cobertura continua contando.',
    tom: 'neutro',
  },
  {
    valor: 'SUGGEST',
    rotulo: 'Sugerir',
    explicacao: 'O padrão. O sistema propõe e uma pessoa decide. Nada entra no cadastro sozinho.',
    tom: 'sucesso',
  },
  {
    valor: 'ON',
    rotulo: 'Vincular sozinho',
    explicacao: 'Série ou UUID batendo com UM único ativo vira vínculo sem perguntar. Continua não criando ativo nem mexendo em posse sozinho.',
    tom: 'aviso',
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo rotulo="Dias para virar fantasma" ajuda="Ativo cujo agente não dá sinal há mais que isso entra na conta de fantasmas.">
          <Input type="number" min={1} max={365} value={ghostDays} onChange={(evento) => setGhostDays(evento.target.value)} />
        </Campo>

        <Campo rotulo="Horas para virar Shadow IT" ajuda="Máquina sem cadastro vista há mais que isso e ainda sem triagem.">
          <Input type="number" min={1} max={720} value={shadowHours} onChange={(evento) => setShadowHours(evento.target.value)} />
        </Campo>
      </div>

      <Button disabled={salvando} onClick={handleSalvar}>
        <Save /> {salvando ? 'Salvando…' : 'Salvar'}
      </Button>
    </>
  );
}

export default function ConfiguracaoDaDescoberta({ configuracao, erro, podeEditar, salvando, onSalvar }: Props) {
  const [aberta, setAberta] = useState(false);

  if (!configuracao) {
    // Sem isto, a consulta que falhou sumia com o cartão e com o botão de configurar.
    return erro ? <Aviso className="mb-6">Não foi possível carregar a configuração: {erro}</Aviso> : null;
  }

  const modoAtual = MODOS.find((modo) => modo.valor === configuracao.discoveryMode) ?? MODOS[1];

  return (
    <Card className="mb-6 overflow-hidden">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((estava) => !estava)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Settings2 className="size-4 text-text-tertiary" /> Descoberta
        </span>
        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-text-tertiary">
          <PontoDeStatus tom={modoAtual.tom}>{modoAtual.rotulo}</PontoDeStatus>
          <span>fantasma em {configuracao.ghostDays}d</span>
          <span>Shadow IT em {configuracao.shadowHours}h</span>
          <ChevronDown className={cn('size-4 transition-transform', aberta && 'rotate-180')} />
        </span>
      </button>

      {aberta && (
        <div className="space-y-5 border-t border-border-sutil p-4">

          {/* O MODO — clique que salva na hora, sem passar por rascunho: é um
              interruptor, e interruptor que precisa de "salvar" depois não
              parece ligado nem desligado. */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">O que fazer com máquina que aparece sem cadastro</p>
            {podeEditar ? (
              // O `fieldset` desliga os botões do `Segmentado` enquanto salva.
              <fieldset disabled={salvando} className="min-w-0 disabled:opacity-50">
                <Segmentado
                  opcoes={MODOS}
                  valor={configuracao.discoveryMode}
                  onChange={(modo) => onSalvar({ discoveryMode: modo })}
                />
              </fieldset>
            ) : (
              <div><PontoDeStatus tom={modoAtual.tom}>{modoAtual.rotulo}</PontoDeStatus></div>
            )}
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {modoAtual.explicacao}
            </p>
            {configuracao.discoveryMode === 'ON' && (
              // O AVISO É DA DECISÃO, não do formulário (D51): em `ON`, a
              // primeira VM de teste que casar por série vira vínculo sem
              // ninguém olhar. É a única opção desta tela cujo erro é silencioso.
              <Aviso tom="aviso" className="max-w-2xl">
                Em “vincular sozinho”, um vínculo errado entra no cadastro sem ninguém revisar,
                e quem abrir a tela do ativo vai ler o vínculo como fato. Desfazer é o botão
                “Desvincular” na aba Máquina.
              </Aviso>
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
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              Fantasma em {configuracao.ghostDays} dias, Shadow IT em {configuracao.shadowHours} horas.
              Só o Supervisor e o Administrador mudam o modo e os prazos.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
