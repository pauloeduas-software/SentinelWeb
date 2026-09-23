import { CheckCircle2, FileText, XCircle } from 'lucide-react';
import AssinaturaCanvas from './components/AssinaturaCanvas';
import { useAceite } from './hooks/useAceite';
import { urlDoPdfPublico } from '../../domain/acceptance/acceptance.queries';
import { formatarData } from '../helpers/format.helper';

// A PÁGINA PÚBLICA DO TERMO — `/aceite/:token`.
//
// A única tela do sistema que alguém SEM CONTA abre. Ela não tem cabeçalho,
// menu nem link para lugar nenhum do painel: quem chega aqui veio de um e-mail
// para ler e assinar um documento, e mostrar-lhe a navegação de um sistema em
// que ele não entra seria oferecer portas fechadas.
//
// Por isso ela também vive FORA do `Layout` autenticado, no `App.tsx`.

export default function AceitePage() {
  const {
    token, termo, carregando, erro, erroDaOperacao,
    setAssinatura, motivo, setMotivo,
    confirmandoRecusa, abrirRecusa, cancelarRecusa,
    handleAceitar, handleRecusar, enviando,
  } = useAceite();

  if (carregando) return <Moldura><p className="text-text-tertiary">Carregando termo…</p></Moldura>;

  if (erro || !termo) {
    return (
      <Moldura>
        <div className="flex items-start gap-3">
          <XCircle size={16} className="text-status-danger shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-status-danger">{erro ?? 'Termo não encontrado.'}</p>
            <p className="text-text-tertiary text-[10px] leading-relaxed">
              Se o link expirou, peça um novo ao time de TI. Cada link é pessoal e vale para um
              equipamento.
            </p>
          </div>
        </div>
      </Moldura>
    );
  }

  const equipamento = termo.asset.name
    ? `${termo.asset.assetTag} — ${termo.asset.name}`
    : termo.asset.assetTag;

  return (
    <Moldura>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-base uppercase tracking-widest text-text-primary">
            Termo de responsabilidade
          </h1>
          <p className="text-text-tertiary text-[10px]">
            Para {termo.signerName} · {termo.signerEmail}
          </p>
        </header>

        <section className="border border-border-sutil p-4 space-y-1">
          <Campo rotulo="Equipamento" valor={equipamento} />
          <Campo rotulo="Modelo" valor={termo.modelo} />
          {termo.asset.serial && <Campo rotulo="Número de série" valor={termo.asset.serial} />}
        </section>

        <section className="whitespace-pre-wrap leading-relaxed text-text-secondary border border-border-sutil p-4 max-h-72 overflow-auto">
          {termo.eulaSnapshot}
        </section>

        {termo.acceptedAt ? (
          <Resolvido
            icone={CheckCircle2}
            cor="text-status-success"
            titulo={`Aceito em ${formatarData(termo.acceptedAt)}`}
            texto="Você pode guardar uma via do documento assinado."
          >
            <a
              href={urlDoPdfPublico(token ?? '')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base uppercase tracking-widest transition-colors"
            >
              <FileText size={13} /> Baixar o termo em PDF
            </a>
          </Resolvido>
        ) : termo.declinedAt ? (
          <Resolvido
            icone={XCircle}
            cor="text-status-warning"
            titulo={`Recusado em ${formatarData(termo.declinedAt)}`}
            texto={termo.declineReason ?? 'Nenhum motivo foi informado. O time de TI foi notificado.'}
          />
        ) : termo.entregaEncerrada ? (
          <Resolvido
            icone={XCircle}
            cor="text-text-tertiary"
            titulo="Este equipamento já foi devolvido"
            texto="O termo não se aplica mais: ele descreveria a guarda de algo que voltou. Não é preciso fazer nada."
          />
        ) : (
          <section className="space-y-4">
            <AssinaturaCanvas onMudar={setAssinatura} desabilitado={enviando} />

            {erroDaOperacao && <p className="text-status-danger text-[10px]">{erroDaOperacao}</p>}

            {confirmandoRecusa ? (
              <div className="space-y-3 border border-status-warning/40 p-4">
                <label className="block space-y-1">
                  <span className="text-text-tertiary text-[10px] uppercase tracking-widest">
                    Por que está recusando? (opcional)
                  </span>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full bg-bg-base border border-border-sutil px-3 py-2 text-text-primary"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Botao onClick={handleRecusar} disabled={enviando} perigo>
                    Confirmar recusa
                  </Botao>
                  <Botao onClick={cancelarRecusa} disabled={enviando}>Voltar</Botao>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Botao onClick={handleAceitar} disabled={enviando} destaque>
                  {enviando ? 'Registrando…' : 'Aceito e assino'}
                </Botao>
                <Botao onClick={abrirRecusa} disabled={enviando}>Recusar</Botao>
              </div>
            )}

            <p className="text-text-tertiary text-[10px] leading-relaxed">
              Assinar é opcional: o aceite fica registrado com a data e a hora de qualquer forma.
              Este link vale até {formatarData(termo.expiresAt)}.
            </p>
          </section>
        )}
      </div>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base flex items-start justify-center p-6">
      <div className="w-full max-w-2xl bg-surface-card border border-border-sutil p-6 my-8 font-mono text-xs">
        {children}
      </div>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-text-tertiary uppercase tracking-widest">{rotulo}</span>
      <span className="text-text-primary">{valor}</span>
    </div>
  );
}

function Resolvido({
  icone: Icone, cor, titulo, texto, children,
}: {
  icone: typeof CheckCircle2;
  cor: string;
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border border-border-sutil p-4">
      <div className="flex items-start gap-3">
        <Icone size={16} className={`${cor} shrink-0 mt-0.5`} />
        <div className="space-y-1">
          <p className="text-text-primary">{titulo}</p>
          <p className="text-text-tertiary text-[10px] leading-relaxed">{texto}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Botao({
  onClick, disabled, destaque, perigo, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  destaque?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  const cor = destaque
    ? 'border-status-success/50 text-status-success hover:bg-status-success/10'
    : perigo
      ? 'border-status-danger/40 text-status-danger hover:bg-status-danger/10'
      : 'border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 border uppercase tracking-widest transition-colors disabled:opacity-40 ${cor}`}
    >
      {children}
    </button>
  );
}
