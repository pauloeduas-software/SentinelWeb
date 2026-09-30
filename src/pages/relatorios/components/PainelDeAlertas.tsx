import { useState } from 'react';
import { Play, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import Indicador from './Indicador';
import {
  useAlertsQuery, useLifecycleSettingsQuery, useMarkAllAlertsRead, useRunAlerts,
  useSaveLifecycleSettings,
} from '../../../domain/alert/alert.queries';
import type { ConfiguracaoDoCicloDeVida } from '../../../domain/shared/lifecycle.types';
import { formatarData } from '../../helpers/format.helper';

// A ABA ALERTAS — a configuração AO LADO dos números que ela explica.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE A CONFIGURAÇÃO MORA AQUI E NÃO EM /configuracoes.
//
// É o mesmo motivo que pôs os botões da descoberta ao lado do painel de cobertura
// na F7: quem muda "antecedência do aviso de garantia" está olhando a lista de
// garantias vencendo e achando que ela avisa cedo ou tarde demais. Numa tela
// separada, o número muda às cegas — e a pessoa volta para cá para descobrir o
// efeito, duas navegações depois.
//
// `/configuracoes` é a tela das sete tabelas de CATÁLOGO. Estes dez valores não
// são um cadastro.
// ═════════════════════════════════════════════════════════════════════════════

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';
const CAMPO = 'bg-bg-base border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary w-full';
const AJUDA = 'text-[10px] text-text-tertiary block leading-relaxed';

/**
 * A ASSINATURA DA CONFIGURAÇÃO — a `key` do formulário.
 *
 * O rascunho é semeado com o que o servidor respondeu, e semear estado a partir de
 * consulta assíncrona NÃO se faz com `setState` dentro de `useEffect`: isso
 * encadeia renders e o lint desta casa reprova, com razão. O jeito do projeto
 * (`CatalogFormModal`, `ConfiguracaoDaDescoberta`) é estado inicial PREGUIÇOSO — e
 * para ele valer quando o dado chega depois, o formulário REMONTA.
 *
 * O efeito colateral é o certo: salvar invalida a consulta, o servidor responde o
 * que ACEITOU, a assinatura muda e o formulário reexibe o valor GRAVADO — não o
 * que foi digitado. Quem tentou `http://` no webhook e levou 422 vê a URL que
 * continua valendo, em vez de um campo mentindo que a mudança pegou.
 */
function assinatura(config: ConfiguracaoDoCicloDeVida): string {
  return [
    config.alertsEnabled, config.alertEmails.join('|'), config.alertWebhookUrl ?? '',
    config.warrantyAlertDays, config.eolAlertDays, config.maintenanceOpenDays,
    config.auditIntervalMonths, config.auditWarningDays, config.alertHour, config.timezone,
  ].join('·');
}

export default function PainelDeAlertas() {
  const { data: config } = useLifecycleSettingsQuery();
  const { data: central } = useAlertsQuery();
  const salvar = useSaveLifecycleSettings();
  const rodar = useRunAlerts();
  const marcarTodos = useMarkAllAlertsRead();

  const [resultado, setResultado] = useState<string | null>(null);

  const handleRodar = async () => {
    try {
      const resposta = await rodar.mutateAsync();
      setResultado(
        resposta.desligado
          ? 'Os alertas estão desligados: a rodada não gravou nem enviou nada.'
          : `${resposta.criados} alerta(s) criado(s) · ${resposta.notificados} notificado(s).`,
      );
    } catch (erro) {
      setResultado((erro as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador
          rotulo="Não lidos"
          valor={String(central?.naoLidos ?? 0)}
          cor={(central?.naoLidos ?? 0) > 0 ? 'var(--color-status-warning)' : undefined}
        />
        <Indicador rotulo="Total na central" valor={String(central?.total ?? 0)} />
        <Indicador
          rotulo="Disparo diário"
          valor={config ? `${String(config.alertHour).padStart(2, '0')}:00` : '—'}
          nota={config?.timezone}
        />
        <Indicador
          rotulo="Canais"
          valor={
            config
              ? [config.alertEmails.length > 0 ? 'e-mail' : null, config.alertWebhookUrl ? 'webhook' : null]
                .filter(Boolean).join(' + ') || 'só a central'
              : '—'
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleRodar()}
          disabled={rodar.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base uppercase tracking-widest text-[10px] transition-colors disabled:opacity-40"
        >
          <Play size={12} /> {rodar.isPending ? 'Rodando…' : 'Rodar varredura agora'}
        </button>
        {(central?.naoLidos ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => marcarTodos.mutate()}
            disabled={marcarTodos.isPending}
            className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest text-[10px] transition-colors disabled:opacity-40"
          >
            Marcar todos como lidos
          </button>
        )}
        <p className={AJUDA}>
          Rodar à mão não consome a janela do dia — o disparo automático das{' '}
          {config ? `${String(config.alertHour).padStart(2, '0')}:00` : 'hora configurada'} continua
          valendo. Repetir não duplica alerta.
        </p>
      </div>

      {resultado && (
        <div className="border border-border-sutil bg-bg-base/40 px-3 py-2 text-[11px] text-text-secondary">
          {resultado}
        </div>
      )}

      {config && (
        <section className="border border-border-sutil bg-surface-card p-4 space-y-4">
          <h3 className="text-[10px] uppercase tracking-widest text-text-secondary">Configuração</h3>
          <Formulario
            key={assinatura(config)}
            config={config}
            salvando={salvar.isPending}
            onSalvar={(dados) => salvar.mutate(dados)}
            erro={salvar.error ? (salvar.error as Error).message : null}
          />
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-widest text-text-secondary">A central</h3>
        {(central?.rows.length ?? 0) === 0 ? (
          <p className="text-text-tertiary text-[11px] border border-border-sutil bg-surface-card px-3 py-3 leading-relaxed">
            Nenhum alerta. A varredura roda uma vez por dia e grava antes de enviar — então esta
            lista existe mesmo sem SMTP configurado.
          </p>
        ) : (
          <div className="border border-border-sutil bg-surface-card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border-sutil bg-bg-base/40">
                <tr>
                  <th className={CABECALHO}>Tipo</th>
                  <th className={CABECALHO}>Ativo</th>
                  <th className={CABECALHO}>Prazo</th>
                  <th className={CABECALHO}>Criado</th>
                  <th className={CABECALHO}>Entrega</th>
                  <th className={CABECALHO}>Leitura</th>
                </tr>
              </thead>
              <tbody>
                {central?.rows.map((alerta) => (
                  <tr key={alerta.id} className="border-b border-border-sutil/40 last:border-0">
                    <td className="px-3 py-2 text-text-secondary">{alerta.rotulo}</td>
                    <td className="px-3 py-2">
                      {alerta.asset ? (
                        <Link to={`/ativos/${alerta.asset.id}`} className="text-text-primary hover:text-status-success transition-colors">
                          {alerta.asset.assetTag}
                        </Link>
                      ) : (
                        <span className="text-text-tertiary">frota</span>
                      )}
                      {alerta.payload?.title && (
                        <span className="text-text-tertiary"> · {alerta.payload.title}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-tertiary">{formatarData(alerta.dueAt)}</td>
                    <td className="px-3 py-2 text-text-tertiary">{formatarData(alerta.createdAt)}</td>
                    <td className="px-3 py-2 text-text-tertiary">
                      {/* `notifiedAt` nulo depois da rodada é a informação de que a
                          PRÓXIMA precisa: ela reenvia. */}
                      {alerta.notifiedAt ? formatarData(alerta.notifiedAt) : <span className="text-status-warning">pendente</span>}
                    </td>
                    <td className="px-3 py-2 text-text-tertiary">
                      {alerta.readAt ? formatarData(alerta.readAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

interface FormularioProps {
  config: ConfiguracaoDoCicloDeVida;
  salvando: boolean;
  erro: string | null;
  onSalvar: (dados: Partial<ConfiguracaoDoCicloDeVida>) => void;
}

/** Um destinatário por linha — é o gesto real de quem cola endereços de um chamado. */
function paraTexto(emails: string[]): string {
  return emails.join('\n');
}

function paraLista(texto: string): string[] {
  return [...new Set(texto.split(/[\n,;]/).map((parte) => parte.trim()).filter(Boolean))];
}

function Formulario({ config, salvando, erro, onSalvar }: FormularioProps) {
  const [ligado, setLigado] = useState(() => config.alertsEnabled);
  const [emails, setEmails] = useState(() => paraTexto(config.alertEmails));
  const [webhook, setWebhook] = useState(() => config.alertWebhookUrl ?? '');
  const [garantia, setGarantia] = useState(() => String(config.warrantyAlertDays));
  const [eol, setEol] = useState(() => String(config.eolAlertDays));
  const [manutencao, setManutencao] = useState(() => String(config.maintenanceOpenDays));
  const [intervalo, setIntervalo] = useState(() => String(config.auditIntervalMonths));
  const [aviso, setAviso] = useState(() => String(config.auditWarningDays));
  const [hora, setHora] = useState(() => String(config.alertHour));
  const [fuso, setFuso] = useState(() => config.timezone);

  const handleSalvar = () => {
    // `Number` e não `parseInt`: campo vazio vira `0`, que o zod do servidor recusa
    // com a mensagem certa ("mínimo de 1") em vez de virar `NaN` e subir como 422
    // sobre um campo que a pessoa nem sabe que mandou.
    onSalvar({
      alertsEnabled: ligado,
      alertEmails: paraLista(emails),
      alertWebhookUrl: webhook.trim() || null,
      warrantyAlertDays: Number(garantia),
      eolAlertDays: Number(eol),
      maintenanceOpenDays: Number(manutencao),
      auditIntervalMonths: Number(intervalo),
      auditWarningDays: Number(aviso),
      alertHour: Number(hora),
      timezone: fuso.trim(),
    });
  };

  return (
    <>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={ligado}
          onChange={(evento) => setLigado(evento.target.checked)}
          className="accent-status-success"
        />
        <span className="text-text-secondary text-[11px]">Alertas ligados</span>
      </label>
      <span className={AJUDA}>
        Desligado, a rodada <span className="text-text-secondary">não grava nada</span> — e não é só
        "não manda e-mail": gravar com o alerta desligado encheria a central em silêncio, e ao religar
        a defesa contra duplicata impediria os avisos de sair, porque eles já existiriam.
      </span>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="space-y-1 block">
          <span className={ROTULO}>Aviso de garantia (dias)</span>
          <input type="number" min={1} max={365} value={garantia} onChange={(e) => setGarantia(e.target.value)} className={CAMPO} />
          <span className={AJUDA}>
            A janela é simétrica: cobre o que vence nos próximos N dias e o que venceu nos últimos N.
            O piso no passado impede a primeira rodada de despejar cinco anos de prazos vencidos.
          </span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Aviso de fim de vida (dias)</span>
          <input type="number" min={1} max={730} value={eol} onChange={(e) => setEol(e.target.value)} className={CAMPO} />
          <span className={AJUDA}>Mais largo que o da garantia de propósito: troca de equipamento é orçamento, não chamado.</span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Manutenção aberta (dias)</span>
          <input type="number" min={1} max={365} value={manutencao} onChange={(e) => setManutencao(e.target.value)} className={CAMPO} />
          <span className={AJUDA}>
            É o que dá prazo a um fato que não tem data-alvo — manutenção aberta não tem
            encerramento, justamente por estar aberta.
          </span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Ciclo de auditoria (meses)</span>
          <input type="number" min={1} max={120} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className={CAMPO} />
          <span className={AJUDA}>
            O corte é calculado a cada consulta. Trocar 12 por 6 vale para a frota inteira na
            próxima leitura, sem nenhuma atualização em massa.
          </span>
        </label>

        <label className="space-y-1 block">
          <span className={ROTULO}>Antecedência da auditoria (dias)</span>
          <input type="number" min={1} max={365} value={aviso} onChange={(e) => setAviso(e.target.value)} className={CAMPO} />
          <span className={AJUDA}>A faixa "a vencer" do relatório de auditorias.</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className={ROTULO}>Hora do disparo</span>
            <input type="number" min={0} max={23} value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
          </label>
          <label className="space-y-1 block">
            <span className={ROTULO}>Fuso</span>
            <input value={fuso} onChange={(e) => setFuso(e.target.value)} placeholder="America/Sao_Paulo" className={CAMPO} />
          </label>
          <span className={`${AJUDA} col-span-2`}>
            A hora é LOCAL neste fuso, e é ele que decide o que é "hoje". O servidor roda em UTC:
            sem isso, uma rodada às 21h em São Paulo já seria o dia seguinte para a máquina.
          </span>
        </div>
      </div>

      <label className="space-y-1 block">
        <span className={ROTULO}>Destinatários</span>
        <textarea
          rows={3}
          value={emails}
          onChange={(evento) => setEmails(evento.target.value)}
          placeholder={'ti@suaempresa.com\npatrimonio@suaempresa.com'}
          className={`${CAMPO} resize-y`}
        />
        <span className={AJUDA}>
          Um por linha, no máximo dez. Passou disso, o que existe é uma lista de distribuição — e
          isso se administra no servidor de e-mail, não numa caixa de texto. Sem destinatário e sem
          webhook, o alerta fica só na central (que é o canal primário).
        </span>
      </label>

      <label className="space-y-1 block">
        <span className={ROTULO}>Webhook (Slack, Teams)</span>
        <input
          value={webhook}
          onChange={(evento) => setWebhook(evento.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          className={CAMPO}
        />
        <span className={AJUDA}>
          Só <span className="text-text-secondary">https</span> e endereço público. Endereço interno
          é recusado: a URL vem do banco e a requisição sai do servidor, então um destino apontando
          para a rede interna transformaria esta caixa num leitor de coisa que ninguém publicou.
        </span>
      </label>

      {erro && (
        <div className="border border-status-danger/40 bg-status-danger/10 text-status-danger px-3 py-2 text-[11px]">
          {erro}
        </div>
      )}

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
