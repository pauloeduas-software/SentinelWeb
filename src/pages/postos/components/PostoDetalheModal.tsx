import { Armchair, TriangleAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import OccupantsPanel from '../../components/OccupantsPanel';
import { caminhoDoPosto, explicacaoDoVago, resumoDeAtivos } from '../helpers/postos.helper';
import type { OccupantInput } from '../../../domain/occupancy/occupancy.queries';
import type { LocationOccupant, OccupantView } from '../../../domain/shared/posse.types';
import type { Posto, PostoDetalhe } from '../../../domain/shared/workstation.types';

// UM POSTO ABERTO: quem está nele e o que foi entregue a ele.
//
// São as duas metades do modelo numa janela só (docs/MODELO-POSSE.md): os
// OCUPANTES (Camada 2, com turno) e os ATIVOS cuja posse aberta aponta para
// este posto (Camada 1 vista do lado do posto). É a junção das duas que
// responde "quem responde pelo mouse da Mesa 1" — e é por isso que as duas
// listas precisam aparecer juntas, não em telas separadas.
//
// MODAL, E NÃO ROTA `/postos/:id` — a decisão, e o porquê:
//   1. as operações daqui (pôr alguém no posto, tirar) são feitas e a pessoa
//      volta para a lista. Uma rota desmontaria a listagem e perderia a busca,
//      o recorte e a página em que ela estava — exatamente o que se estava
//      usando para achar este posto;
//   2. a mesma operação já é um painel dentro de uma janela na aba
//      Localizações; virar rota aqui criaria duas experiências para o mesmo ato;
//   3. uma rota pediria estado de "id que não existe" e uma navegação própria,
//      para um link que ninguém precisa compartilhar hoje.
// Se um dia a ficha do posto virar destino de link (um QR code na mesa, por
// exemplo), ela vira rota — e este componente é o corpo dela, sem reescrita.

interface PostoDetalheModalProps {
  /** A linha clicada: dá título à janela no primeiro quadro, antes do detalhe. */
  posto: Posto;
  detalhe: PostoDetalhe | null;
  carregando: boolean;
  ocupantes: readonly LocationOccupant[];
  ocupantesCarregando: boolean;
  view: OccupantView;
  onViewChange: (view: OccupantView) => void;
  onAdicionar: (data: OccupantInput) => Promise<void>;
  onEncerrar: (ocupante: LocationOccupant) => Promise<void>;
  onClose: () => void;
}

export default function PostoDetalheModal({
  posto, detalhe, carregando, ocupantes, ocupantesCarregando,
  view, onViewChange, onAdicionar, onEncerrar, onClose,
}: PostoDetalheModalProps) {
  // Enquanto o detalhe não chega, vale o que a linha já dizia: o cabeçalho e o
  // selo de vago aparecem no primeiro quadro em vez de piscar depois.
  const ativos = detalhe?.ativos ?? [];
  const vago = detalhe?.vago ?? posto.vago;
  const totalAtivos = detalhe?.totalAtivos ?? posto.totalAtivos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-start justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div>
            <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
              <Armchair size={16} /> {posto.name}
            </h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-2">
              {caminhoDoPosto(detalhe?.caminho ?? posto.caminho)}
              {detalhe?.manager && <> · gestor: {detalhe.manager.name}</>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[78vh] space-y-6">
          {vago && (
            <div className="flex items-start gap-2 p-3 border border-status-warning/20 bg-status-warning/10 font-mono text-[10px] leading-relaxed text-status-warning">
              <TriangleAlert size={12} className="shrink-0 mt-0.5" />
              <span>
                POSTO VAGO — {explicacaoDoVago({ totalAtivos })} Ou alguém assume o posto abaixo,
                ou o equipamento volta para o estoque.
              </span>
            </div>
          )}

          <OccupantsPanel
            ocupantes={ocupantes}
            carregando={ocupantesCarregando}
            view={view}
            onViewChange={onViewChange}
            onAdicionar={onAdicionar}
            onEncerrar={onEncerrar}
          />

          <section className="font-mono text-xs space-y-3 border-t border-border-sutil pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-text-secondary uppercase tracking-widest text-[10px]">
                Ativos entregues a este posto
              </h3>
              <span className="text-text-tertiary tabular-nums">{resumoDeAtivos(totalAtivos)}</span>
            </div>

            <p className="text-text-tertiary text-[10px] leading-relaxed">
              São os ativos cuja posse aberta aponta para esta localização — não os que estão
              guardados aqui. Um ativo pode estar EM um lugar sem ser DO lugar, e entregar ou
              devolver continua sendo feito na tela de Ativos.
            </p>

            <div className="border border-border-sutil overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 font-normal">Etiqueta</th>
                    <th className="px-4 py-3 font-normal">Modelo</th>
                    <th className="px-4 py-3 font-normal">Categoria</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border-sutil/50">
                  {ativos.map((ativo) => (
                    <tr key={ativo.id} className="hover:bg-bg-base transition-colors">
                      <td className="px-4 py-3 text-text-primary">
                        <div>{ativo.assetTag}</div>
                        {ativo.serial && (
                          <div className="text-[10px] text-text-tertiary mt-1">SN {ativo.serial}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        <div>{ativo.model.name}</div>
                        <div className="text-[10px] text-text-tertiary mt-1">{ativo.model.manufacturer.name}</div>
                      </td>
                      <td className="px-4 py-3 text-text-tertiary">{ativo.model.category.name}</td>
                      <td className="px-4 py-3">
                        {/* A cor vem do banco (StatusLabel.color), então vai por
                            `style` — o Tailwind não gera classe a partir de
                            string de runtime. */}
                        <span
                          className="px-2 py-1 border rounded-[2px] text-[10px] uppercase tracking-widest"
                          style={ativo.status.color
                            ? {
                                color: ativo.status.color,
                                borderColor: `${ativo.status.color}33`,
                                backgroundColor: `${ativo.status.color}1a`,
                              }
                            : undefined}
                        >
                          {ativo.status.name}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {ativos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-text-tertiary">
                        {carregando ? (
                          'Carregando...'
                        ) : (
                          <>
                            Nenhum ativo entregue a este posto.
                            <span className="block mt-3 text-[10px] leading-relaxed">
                              A entrega é feita em{' '}
                              <Link to="/itam" className="text-status-success hover:underline">Ativos</Link>
                              , escolhendo este posto como destino.
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil font-mono text-xs text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
