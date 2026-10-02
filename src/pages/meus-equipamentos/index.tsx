import { Armchair, Boxes, Laptop, ScrollText, Users } from 'lucide-react';
import { useMeusEquipamentos } from './hooks/useMeusEquipamentos';
import { formatarData } from '../helpers/format.helper';

// MEUS EQUIPAMENTOS — o portal do colaborador (F11, Etapa I).
//
// ═══════════════════════════════════════════════════════════════════════════
// O NOME DA TELA É O QUE ELA LISTA (D141), e não `/portal`.
//
// "Portal" nomeia o tipo de software, não o conteúdo — é o mesmo erro que `/itam`
// foi até a F6. A tela lista equipamentos que estão no meu nome, e é esse o nome.
//
// E A DECISÃO QUE A FAZ EXISTIR: OS DOIS BALDES.
//
// Um ITAM comum mostraria "meus equipamentos" numa lista só. Aqui a lista é duas,
// e a segunda diz COM QUEM o posto é dividido — porque sem isso a pessoa devolve
// o monitor da sala achando que era dela, e a colega do turno da tarde fica sem
// monitor. A responsabilidade por equipamento de posto é compartilhada
// (docs/MODELO-POSSE.md, Camada 2), e uma tela que esconde isso produz a
// devolução errada.
//
// O QUE ELA NÃO TEM, de propósito:
//   - botão de devolver. Devolução é operação de quem recebe de volta (`checkin`,
//     com `assets.checkout`), e não do próprio colaborador: o equipamento tem de
//     passar pela mão de alguém do time de TI;
//   - solicitar item. Está em *Descartado de propósito* no ITAM-TODO, e esta fase
//     não reabre: time pequeno pede no chat, e duas telas de fila valem zero.
// ═══════════════════════════════════════════════════════════════════════════

const CELULA = 'px-4 py-3';

export default function MeusEquipamentosPage() {
  const { carregando, erro, diretos, porPosto, acessorios, assentos, vazio } = useMeusEquipamentos();

  if (carregando) {
    return (
      <p className="p-8 text-center font-mono text-xs uppercase tracking-widest text-text-tertiary">
        Carregando...
      </p>
    );
  }

  return (
    <div className="animate-in fade-in space-y-8 font-mono text-xs duration-300">
      <header className="space-y-2">
        <h2 className="text-xl uppercase tracking-widest text-text-primary">Meus equipamentos</h2>
        <p className="max-w-2xl leading-relaxed text-text-tertiary">
          O que está no seu nome e o que você responde por ocupar um posto de trabalho. As duas
          listas são separadas porque se desfazem de jeitos diferentes: a primeira com uma
          devolução, a segunda com uma troca de escala.
        </p>
      </header>

      {erro && (
        <div className="border border-status-danger/20 bg-status-danger/10 p-3 text-status-danger">
          {erro}
        </div>
      )}

      {vazio && (
        <p className="border border-border-sutil p-6 text-center leading-relaxed text-text-tertiary">
          Nada em seu nome hoje. Equipamento entregue a você — ou ao posto que você ocupa —
          aparece aqui.
        </p>
      )}

      {/* ── BALDE 1: NO MEU NOME ─────────────────────────────────────────── */}
      {diretos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <Laptop size={14} className="text-text-tertiary" />
            <h3 className="uppercase tracking-widest text-text-secondary">
              No seu nome <span className="text-text-tertiary">({diretos.length})</span>
            </h3>
          </div>
          <p className="leading-relaxed text-text-tertiary">
            Entregue a você, e a guarda é sua. Sai da sua responsabilidade quando você devolver ao
            time de TI.
          </p>

          <div className="overflow-x-auto border border-border-sutil bg-surface-card">
            <table className="w-full min-w-[560px] text-left whitespace-nowrap">
              <thead className="border-b border-border-sutil bg-bg-base/50 uppercase tracking-widest text-text-secondary">
                <tr>
                  <th className={CELULA}>Etiqueta</th>
                  <th className={CELULA}>Equipamento</th>
                  <th className={CELULA}>Série</th>
                  <th className={CELULA}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {diretos.map((asset) => (
                  <tr key={asset.id} className="border-b border-border-sutil/50 last:border-0">
                    <td className={`${CELULA} text-text-primary`}>{asset.assetTag}</td>
                    <td className={CELULA}>
                      {asset.model.manufacturer.name} {asset.model.name}
                    </td>
                    <td className={`${CELULA} text-text-tertiary`}>{asset.serial ?? '--'}</td>
                    <td className={`${CELULA} text-text-tertiary`}>{asset.status.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── BALDE 2: PELO POSTO, E COM QUEM ──────────────────────────────── */}
      {porPosto.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <Armchair size={14} className="text-text-tertiary" />
            <h3 className="uppercase tracking-widest text-text-secondary">
              Pelo posto que você ocupa <span className="text-text-tertiary">({porPosto.length})</span>
            </h3>
          </div>
          <p className="max-w-2xl leading-relaxed text-text-tertiary">
            Estes equipamentos são <strong className="text-text-secondary">do posto</strong>, não
            seus: quem ocupa a mesma mesa responde junto. Não devolva por conta própria — quem sai
            do posto deixa de responder, e o equipamento fica para quem continua.
          </p>

          <div className="overflow-x-auto border border-border-sutil bg-surface-card">
            <table className="w-full min-w-[640px] text-left whitespace-nowrap">
              <thead className="border-b border-border-sutil bg-bg-base/50 uppercase tracking-widest text-text-secondary">
                <tr>
                  <th className={CELULA}>Etiqueta</th>
                  <th className={CELULA}>Equipamento</th>
                  <th className={CELULA}>Posto</th>
                  <th className={CELULA}>Dividido com</th>
                </tr>
              </thead>
              <tbody>
                {porPosto.map((asset) => (
                  <tr key={`${asset.id}-${asset.posto.locationId}`} className="border-b border-border-sutil/50 last:border-0">
                    <td className={`${CELULA} text-text-primary`}>{asset.assetTag}</td>
                    <td className={CELULA}>
                      {asset.model.manufacturer.name} {asset.model.name}
                    </td>
                    <td className={`${CELULA} text-text-tertiary`}>
                      {asset.posto.locationName}
                      {asset.posto.shift && <span> ({asset.posto.shift})</span>}
                    </td>
                    {/* COM QUEM — a célula que impede a devolução errada. Vazia
                        quando a pessoa é a única ocupante, e aí o posto é dela. */}
                    <td className={CELULA}>
                      {asset.posto.coOcupantes && asset.posto.coOcupantes.length > 0 ? (
                        <span className="flex items-center gap-1.5 text-text-secondary">
                          <Users size={12} className="text-text-tertiary" />
                          {asset.posto.coOcupantes
                            .map((pessoa) => (pessoa.shift ? `${pessoa.name} (${pessoa.shift})` : pessoa.name))
                            .join(', ')}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">só você</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── ACESSÓRIOS: UMA LISTA, COM A `via` POR LINHA (D33) ───────────── */}
      {acessorios.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <Boxes size={14} className="text-text-tertiary" />
            <h3 className="uppercase tracking-widest text-text-secondary">
              Acessórios <span className="text-text-tertiary">({acessorios.length})</span>
            </h3>
          </div>
          <p className="leading-relaxed text-text-tertiary">
            Mouse, headset, cabo. <span className="text-text-secondary">Direto</span> é seu;
            <span className="text-text-secondary"> posto</span> é da mesa, e você responde junto com
            quem a divide.
          </p>

          <div className="overflow-x-auto border border-border-sutil bg-surface-card">
            <table className="w-full min-w-[560px] text-left whitespace-nowrap">
              <thead className="border-b border-border-sutil bg-bg-base/50 uppercase tracking-widest text-text-secondary">
                <tr>
                  <th className={CELULA}>Item</th>
                  <th className={CELULA}>Como</th>
                  <th className={CELULA}>Desde</th>
                </tr>
              </thead>
              <tbody>
                {acessorios.map((item) => (
                  <tr key={item.checkoutId} className="border-b border-border-sutil/50 last:border-0">
                    <td className={`${CELULA} text-text-primary`}>{item.name}</td>
                    <td className={CELULA}>
                      {item.via === 'DIRETO' ? (
                        <span className="text-text-secondary">direto</span>
                      ) : (
                        <span className="text-text-tertiary">
                          posto{item.posto ? ` · ${item.posto.locationName}` : ''}
                        </span>
                      )}
                    </td>
                    <td className={`${CELULA} tabular-nums text-text-tertiary`}>
                      {formatarData(item.checkedOutAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── ASSENTOS DE LICENÇA (F6) ─────────────────────────────────────── */}
      {assentos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <ScrollText size={14} className="text-text-tertiary" />
            <h3 className="uppercase tracking-widest text-text-secondary">
              Licenças <span className="text-text-tertiary">({assentos.length})</span>
            </h3>
          </div>
          <p className="leading-relaxed text-text-tertiary">
            Software no seu nome. A chave de produto não aparece aqui — ela é revelada por quem
            administra as licenças, e cada revelação fica registrada.
          </p>

          <div className="overflow-x-auto border border-border-sutil bg-surface-card">
            <table className="w-full min-w-[480px] text-left whitespace-nowrap">
              <thead className="border-b border-border-sutil bg-bg-base/50 uppercase tracking-widest text-text-secondary">
                <tr>
                  <th className={CELULA}>Licença</th>
                  <th className={CELULA}>Assento</th>
                  <th className={CELULA}>Desde</th>
                </tr>
              </thead>
              <tbody>
                {assentos.map((assento) => (
                  <tr key={assento.checkoutId} className="border-b border-border-sutil/50 last:border-0">
                    <td className={`${CELULA} text-text-primary`}>{assento.licenseName}</td>
                    <td className={`${CELULA} text-text-tertiary`}>#{assento.seatNumber}</td>
                    <td className={`${CELULA} tabular-nums text-text-tertiary`}>
                      {formatarData(assento.checkoutAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
