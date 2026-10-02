import { ShieldCheck, ShieldOff, X } from 'lucide-react';
import type { StatusDoSegundoFator } from '../../../domain/shared/auth.types';
import type { useMinhaConta } from '../hooks/useMinhaConta';

type Conta = ReturnType<typeof useMinhaConta>;

interface Props {
  fator: StatusDoSegundoFator | null;
  carregando: boolean;
  conta: Conta;
}

const CAMPO =
  'w-full bg-bg-base border border-border-sutil p-2 text-text-primary tracking-[0.3em] focus:outline-none focus:border-text-secondary transition-colors';

/**
 * O SEGUNDO FATOR, nos três estados que ele tem.
 *
 *   desligado   um botão, e a explicação do que vai acontecer;
 *   cadastrando o QR + o campo do primeiro código (o estado intermediário existe
 *               no banco: `totpSecret` gravado, `totpEnabledAt` nulo);
 *   ativo       a contagem de códigos de recuperação e o caminho de desligar.
 *
 * O QUE ESTA TELA NÃO OFERECE, e é decisão: trocar de aplicativo sem desligar
 * antes. Trocar exige provar que se controla o atual — senão quem roubasse uma
 * sessão aberta expulsaria o dono da própria conta com dois cliques.
 */
export default function SegundoFatorPanel({ fator, carregando, conta }: Props) {
  if (carregando || !fator) {
    return (
      <p className="p-8 text-center text-[10px] uppercase tracking-widest text-text-tertiary">
        Carregando...
      </p>
    );
  }

  return (
    <section className="space-y-4 border border-border-sutil bg-surface-card p-4">
      <header className="flex items-start justify-between gap-4 border-b border-border-sutil pb-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 uppercase tracking-widest text-text-primary">
            {fator.ativo ? <ShieldCheck size={14} className="text-status-success" /> : <ShieldOff size={14} className="text-text-tertiary" />}
            Verificação em duas etapas
          </h3>
          <p className="max-w-xl text-[10px] leading-relaxed text-text-tertiary">
            Um código de seis dígitos do seu celular, pedido depois da senha. Vale para quem já
            descobriu a sua senha — e é a única defesa que sobra nesse caso.
          </p>
        </div>

        <span
          className={`shrink-0 border px-2 py-1 text-[10px] uppercase tracking-widest ${
            fator.ativo
              ? 'border-status-success/40 text-status-success'
              : 'border-border-sutil text-text-tertiary'
          }`}
        >
          {fator.ativo ? 'ativo' : 'desligado'}
        </span>
      </header>

      {/* ── OS CÓDIGOS DE RECUPERAÇÃO, UMA VEZ ────────────────────────────── */}
      {conta.codigosDeRecuperacao && (
        <div className="space-y-3 border border-status-warning/50 bg-status-warning/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-text-primary">
              Guarde estes oito códigos agora — esta é a única vez que eles aparecem.
            </p>
            <button
              type="button"
              onClick={conta.fecharCodigos}
              title="Já guardei"
              className="shrink-0 text-text-tertiary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-text-tertiary">
            Cada um serve UMA vez, e entra no lugar do código do aplicativo quando você não tiver o
            celular. O servidor guarda só o hash deles: não há tela, rota nem suporte que os mostre
            de novo.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {conta.codigosDeRecuperacao.map((codigo) => (
              <li key={codigo} className="select-all border border-border-sutil bg-bg-base p-2 text-center text-text-primary">
                {codigo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── DESLIGADO: o convite ──────────────────────────────────────────── */}
      {!fator.ativo && !conta.cadastro && (
        <div className="space-y-3">
          {fator.cadastroPendente && (
            <p className="border border-border-sutil bg-bg-base/50 p-3 text-[10px] leading-relaxed text-text-tertiary">
              Há um cadastro começado e não confirmado. Começar de novo gera um QR novo e
              <strong className="text-text-secondary"> invalida o anterior</strong> — se você leu o
              antigo no celular, apague aquela entrada.
            </p>
          )}
          <button
            type="button"
            onClick={() => void conta.handleIniciar()}
            disabled={conta.iniciando}
            className="border border-border-sutil px-3 py-2 uppercase tracking-widest text-text-secondary transition-colors hover:bg-bg-base hover:text-text-primary disabled:opacity-50"
          >
            {conta.iniciando ? 'Gerando...' : fator.cadastroPendente ? 'Começar de novo' : 'Ativar'}
          </button>
        </div>
      )}

      {/* ── CADASTRANDO: o QR e o primeiro código ─────────────────────────── */}
      {conta.cadastro && (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* O PNG vem do SERVIDOR como data URL: é o que dispensa uma
                biblioteca de QR no bundle do painel. */}
            <img
              src={conta.cadastro.qrcode}
              alt="QR Code do segundo fator"
              className="h-40 w-40 shrink-0 border border-border-sutil bg-white p-2"
            />

            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-[10px] leading-relaxed text-text-tertiary">
                Leia o QR no seu aplicativo autenticador. Sem câmera, cadastre a chave abaixo à mão.
              </p>
              <code className="block select-all break-all border border-border-sutil bg-bg-base p-2 text-text-primary">
                {conta.cadastro.secret}
              </code>

              <div className="space-y-1">
                <label htmlFor="totp" className="text-[10px] uppercase tracking-widest text-text-secondary">
                  Código do aplicativo
                </label>
                <input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={conta.codigo}
                  onChange={(evento) => conta.setCodigo(evento.target.value)}
                  className={CAMPO}
                  placeholder="000000"
                />
                <p className="text-[10px] leading-relaxed text-text-tertiary">
                  Até confirmar, o seu login continua pedindo só a senha — um cadastro pela metade
                  não tranca ninguém.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void conta.handleConfirmar()}
                  disabled={conta.confirmando || conta.codigo.trim().length < 6}
                  className="bg-text-primary px-3 py-2 uppercase tracking-widest text-bg-base transition-colors hover:bg-text-secondary disabled:opacity-50"
                >
                  {conta.confirmando ? 'Conferindo...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={conta.cancelarCadastro}
                  className="border border-border-sutil px-3 py-2 uppercase tracking-widest text-text-tertiary transition-colors hover:text-text-primary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ATIVO: os códigos restantes e o desligamento ──────────────────── */}
      {fator.ativo && (
        <div className="space-y-4">
          <p className="text-text-secondary">
            Códigos de recuperação restantes:{' '}
            <strong className={fator.codigosRestantes === 0 ? 'text-status-danger' : 'text-text-primary'}>
              {fator.codigosRestantes}
            </strong>
          </p>
          {fator.codigosRestantes === 0 && (
            <p className="border border-status-danger/40 bg-status-danger/5 p-3 text-[10px] leading-relaxed text-status-danger">
              Sem código de recuperação: perder o celular passa a exigir um comando no servidor
              (<code>npm run totp:desativar</code>). Desligue e ligue de novo para receber oito novos.
            </p>
          )}

          <div className="space-y-2 border-t border-border-sutil pt-3">
            <label htmlFor="desligar" className="text-[10px] uppercase tracking-widest text-text-secondary">
              Para desligar, confirme com um código
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="desligar"
                value={conta.codigoParaDesativar}
                onChange={(evento) => conta.setCodigoParaDesativar(evento.target.value)}
                className={`${CAMPO} sm:max-w-xs`}
                placeholder="000000 ou XXXXX-XXXXX"
              />
              <button
                type="button"
                onClick={() => void conta.handleDesativar()}
                disabled={conta.desativando || conta.codigoParaDesativar.trim().length < 6}
                className="border border-status-danger/40 px-3 py-2 uppercase tracking-widest text-status-danger transition-colors hover:bg-status-danger/10 disabled:opacity-50"
              >
                {conta.desativando ? 'Desligando...' : 'Desligar'}
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-text-tertiary">
              O código é exigido de propósito: sem ele, quem tivesse uma sessão sua aberta desligaria
              a proteção com um clique. Serve o do aplicativo ou um de recuperação.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
