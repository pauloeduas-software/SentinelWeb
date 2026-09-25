import { useState } from 'react';
import { CheckCircle2, LogOut, TriangleAlert, X } from 'lucide-react';
import ReferenceSelect from '../../../components/ReferenceSelect';
import type { OffboardInput, ResultadoDesligamento } from '../../../../domain/user/user.queries';
import type { AcessorioEmPosse } from '../../../../domain/shared/stock.types';
import type { AssentoEmPosse } from '../../../../domain/shared/license.types';
import type { Asset, PostoDoAtivo } from '../../../../domain/shared/asset.types';
import type { LocationOccupant } from '../../../../domain/shared/posse.types';

// DESLIGAMENTO — o modal que diz EXATAMENTE o que vai acontecer, antes de
// acontecer (D32).
//
// Ele não pergunta "tem certeza?". Ele mostra a lista de ativos que serão
// devolvidos e a lista de postos que serão desocupados, com nome e turno,
// porque é uma operação que fecha N+M vínculos numa transação só e não tem
// desfazer: a devolução refeita à mão perderia a data, e a ocupação reaberta
// nasceria com `startedAt` de hoje, apagando desde quando a pessoa estava lá.
//
// O terceiro bloco — o que NÃO acontece — é tão importante quanto os outros
// dois: o ativo entregue a um POSTO continua com o posto, e a pessoa NÃO vai
// para a lixeira. Sem dizer isso, quem lê "vai devolver tudo" procura depois o
// monitor da Mesa 1 na lista de devoluções e não encontra.
//
// ═════════════════════════════════════════════════════════════════════════════
// A QUEIMA DE ASSENTO É O ÚNICO PASSO QUE DESTRÓI VALOR (F6, D43).
//
// Devolver ativo, acessório e posto é reversível: entrega-se de novo. Um
// assento de licença `reassignable = false` devolvido NÃO VOLTA ao contrato —
// a empresa comprou 50 e passa a ter 49, e não há operação no sistema que
// desfaça isso, porque o que mudou foi o direito de uso, não uma linha.
//
// Por isso ele tem aviso PRÓPRIO, em vermelho e com os nomes das licenças, e
// não só uma linha no passo 3. É a mesma razão de o modal existir: ele não
// pergunta "tem certeza?", ele diz o que vai acontecer.
// ═════════════════════════════════════════════════════════════════════════════

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

/** "Mesa 1 (Manhã)" — o turno entre parênteses, quando existe. */
function postoComTurno(nome: string, shift: string | null): string {
  return shift ? `${nome} (${shift})` : nome;
}

interface OffboardModalProps {
  nome: string;
  /** Os ativos no NOME da pessoa — os únicos que a operação devolve. */
  diretos: readonly Asset[];
  /** Os ativos que ela responde POR OCUPAR um posto — que ficam onde estão. */
  porPosto: readonly (Asset & { posto: PostoDoAtivo })[];
  /**
   * Os acessórios (F5), com a `via` em cada um. A operação devolve SÓ os de
   * `via: 'DIRETO'` — as unidades do posto continuam na mesa, com quem ficou.
   */
  acessorios: readonly AcessorioEmPosse[];
  /**
   * Os assentos de licença no NOME da pessoa (F6) — todos serão devolvidos.
   *
   * Já vêm filtrados pelo servidor: os assentos dos ATIVOS dela não estão aqui,
   * porque são da máquina e o desligamento não os toca.
   */
  assentos: readonly AssentoEmPosse[];
  /** As ocupações abertas — todas serão encerradas. */
  ocupacoes: readonly LocationOccupant[];
  onClose: () => void;
  onConfirmar: (data: OffboardInput) => Promise<void>;
  salvando: boolean;
  /** Preenchido DEPOIS de confirmar: o modal vira relatório. */
  resultado: ResultadoDesligamento | null;
}

export default function OffboardModal({
  nome, diretos, porPosto, acessorios, assentos, ocupacoes,
  onClose, onConfirmar, salvando, resultado,
}: OffboardModalProps) {
  const [notes, setNotes] = useState('');
  const [statusId, setStatusId] = useState('');
  const [erro, setErro] = useState('');

  // Cálculo fora do JSX (docs/ARQUITETURA.md). Os dois recortes existem porque
  // a operação trata os dois grupos de forma OPOSTA: os diretos voltam ao
  // estoque, os do posto ficam onde estão (D33).
  const acessoriosDiretos = acessorios.filter((acessorio) => acessorio.via === 'DIRETO');
  const acessoriosDoPosto = acessorios.filter((acessorio) => acessorio.via === 'POSTO');

  // Os assentos que a devolução vai DESTRUIR. Recorte à parte porque o aviso
  // deles é outro: os demais voltam ao contrato e podem ser reentregues amanhã.
  const assentosQueQueimam = assentos.filter((assento) => !assento.reassignable);

  // O mesmo recorte do outro lado da operação: o que o servidor REALMENTE
  // queimou. Sai do `resultado` e não do `assentos` acima porque entre abrir o
  // modal e confirmar cabe uma devolução feita em outra aba — quem manda é o
  // que a transação fez, não o que a tela previu.
  const queimados = resultado?.assentosDevolvidos.filter((assento) => assento.queimado) ?? [];

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');

    const corpo: OffboardInput = {};
    if (notes.trim()) corpo.notes = notes.trim();
    if (statusId) corpo.statusId = statusId;

    try {
      await onConfirmar(corpo);
    } catch (falha) {
      // "Este colaborador já foi desligado." é o caso real: duas abas abertas,
      // ou alguém que desligou pela lista enquanto este modal estava no ar.
      setErro((falha as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            <LogOut size={16} />
            {resultado ? 'Desligamento concluído' : `Desligar ${nome}`}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {resultado ? (
          <div className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
            <div className="flex items-start gap-2 text-status-success leading-relaxed">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>
                {resultado.devolvidos.length} {resultado.devolvidos.length === 1 ? 'ativo devolvido' : 'ativos devolvidos'},{' '}
                {resultado.acessoriosDevolvidos.length}{' '}
                {resultado.acessoriosDevolvidos.length === 1 ? 'acessório devolvido' : 'acessórios devolvidos'},{' '}
                {resultado.assentosDevolvidos.length}{' '}
                {resultado.assentosDevolvidos.length === 1 ? 'assento devolvido' : 'assentos devolvidos'} e{' '}
                {resultado.ocupacoesEncerradas.length}{' '}
                {resultado.ocupacoesEncerradas.length === 1 ? 'posto desocupado' : 'postos desocupados'}, na mesma operação.
              </span>
            </div>

            {/* O PLACAR DA PERDA, separado do da devolução e DEPOIS do fato.
                O aviso antes de confirmar era para decidir; este é o registro
                do que aconteceu, e ele fica na tela porque é o número que
                alguém vai precisar repetir para o financeiro. */}
            {queimados.length > 0 && (
              <div className="flex items-start gap-2 text-status-danger text-[10px] leading-relaxed border border-status-danger/30 bg-status-danger/10 p-3">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <span>
                  {queimados.length} {queimados.length === 1 ? 'assento foi QUEIMADO' : 'assentos foram QUEIMADOS'}:{' '}
                  {queimados.map((item) => `${item.licenseName} #${item.seatNumber}`).join(', ')}.
                  {queimados.length === 1 ? ' Ele não volta' : ' Eles não voltam'} ao contrato — o
                  histórico de cada licença registra a perda.
                </span>
              </div>
            )}

            <Bloco titulo={`Devolvidos (${resultado.devolvidos.length})`}>
              {resultado.devolvidos.map((item) => (
                <li key={item.assignmentId} className="px-4 py-2 text-text-primary">{item.assetTag}</li>
              ))}
            </Bloco>

            <Bloco titulo={`Acessórios devolvidos (${resultado.acessoriosDevolvidos.length})`}>
              {resultado.acessoriosDevolvidos.map((item) => (
                <li key={item.checkoutId} className="px-4 py-2 text-text-primary">
                  {item.accessoryName}
                </li>
              ))}
            </Bloco>

            <Bloco titulo={`Assentos devolvidos (${resultado.assentosDevolvidos.length})`}>
              {resultado.assentosDevolvidos.map((item) => (
                <li key={item.checkoutId} className="px-4 py-2 text-text-primary flex items-center gap-2">
                  <span>{item.licenseName}</span>
                  <span className="text-text-tertiary">#{item.seatNumber}</span>
                  {item.queimado && <span className="text-status-danger">— queimado</span>}
                </li>
              ))}
            </Bloco>

            <Bloco titulo={`Postos desocupados (${resultado.ocupacoesEncerradas.length})`}>
              {resultado.ocupacoesEncerradas.map((item) => (
                <li key={item.id} className="px-4 py-2 text-text-primary">
                  {postoComTurno(item.locationName, item.shift)}
                </li>
              ))}
            </Bloco>

            <p className="text-text-tertiary text-[10px] leading-relaxed">
              O cadastro continua existindo, marcado como desligado: todo o histórico de posse segue
              apontando para ele. A exclusão (lixeira) é outra coisa, e agora está liberada.
            </p>

            <div className="pt-4 flex justify-end border-t border-border-sutil">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
            {erro && (
              <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
            )}

            <p className="text-text-secondary leading-relaxed">
              Ao confirmar, numa operação só:
            </p>

            <Bloco titulo={`1. Devolver ${diretos.length} ${diretos.length === 1 ? 'ativo' : 'ativos'} em nome de ${nome}`}>
              {diretos.map((asset) => (
                <li key={asset.id} className="px-4 py-2 text-text-primary">
                  {asset.assetTag}
                  {asset.name && <span className="text-text-tertiary"> — {asset.name}</span>}
                </li>
              ))}
            </Bloco>

            <Bloco titulo={`2. Devolver ${acessoriosDiretos.length} ${acessoriosDiretos.length === 1 ? 'acessório' : 'acessórios'} em nome de ${nome}`}>
              {acessoriosDiretos.map((acessorio) => (
                <li key={acessorio.checkoutId} className="px-4 py-2 text-text-primary">
                  {acessorio.name}
                </li>
              ))}
            </Bloco>

            <Bloco titulo={`3. Devolver ${assentos.length} ${assentos.length === 1 ? 'assento de licença' : 'assentos de licença'} em nome de ${nome}`}>
              {assentos.map((assento) => (
                <li key={assento.checkoutId} className="px-4 py-2 text-text-primary flex items-center gap-2">
                  <span>{assento.licenseName}</span>
                  <span className="text-text-tertiary">#{assento.seatNumber}</span>
                  {!assento.reassignable && (
                    <span className="text-status-danger">— queima</span>
                  )}
                </li>
              ))}
            </Bloco>

            <Bloco titulo={`4. Encerrar ${ocupacoes.length} ${ocupacoes.length === 1 ? 'ocupação de posto' : 'ocupações de posto'}`}>
              {ocupacoes.map((ocupacao) => (
                <li key={ocupacao.id} className="px-4 py-2 text-text-primary">
                  {postoComTurno(ocupacao.location?.name ?? 'Posto', ocupacao.shift)}
                </li>
              ))}
            </Bloco>

            <div className="border border-border-sutil p-4 space-y-2">
              <div className={ROTULO}>5. Marcar a saída</div>
              <p className="text-text-tertiary text-[10px] leading-relaxed">
                A pessoa deixa de operar e não pode mais receber equipamento. O cadastro NÃO é
                excluído: desligar e mandar para a lixeira são coisas diferentes, e o histórico de
                posse precisa continuar apontando para alguém.
              </p>
            </div>

            {/* O PRIMEIRO dos avisos, e em vermelho enquanto os outros são
                amarelos: os outros dois dizem que algo NÃO vai acontecer (o
                mouse fica na mesa, o ativo fica no posto) e são reversíveis de
                qualquer forma. Este diz que algo vai acontecer e não tem
                desfazer. */}
            {assentosQueQueimam.length > 0 && (
              <div className="flex items-start gap-2 text-status-danger text-[10px] leading-relaxed border border-status-danger/30 bg-status-danger/10 p-3">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <span>
                  {assentosQueQueimam.length}{' '}
                  {assentosQueQueimam.length === 1 ? 'assento será QUEIMADO' : 'assentos serão QUEIMADOS'}{' '}
                  na devolução: {assentosQueQueimam.map((assento) => `${assento.licenseName} #${assento.seatNumber}`).join(', ')}.
                  {assentosQueQueimam.length === 1 ? ' Esta licença não é reatribuível' : ' Estas licenças não são reatribuíveis'},
                  então o assento não volta ao contrato — nem agora, nem depois.
                  {' '}É perda de patrimônio, e não tem desfazer: se o contrato pode ser
                  reaproveitado, devolva o assento por fora antes de desligar.
                </span>
              </div>
            )}

            {acessoriosDoPosto.length > 0 && (
              <div className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed border border-status-warning/30 bg-status-warning/10 p-3">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <span>
                  {acessoriosDoPosto.length}{' '}
                  {acessoriosDoPosto.length === 1 ? 'acessório continua' : 'acessórios continuam'} no
                  posto e NÃO {acessoriosDoPosto.length === 1 ? 'volta' : 'voltam'} ao estoque. Eles
                  estão fisicamente na mesa e continuam lá com quem ficou — devolvê-los faria o
                  inventário mentir com o saldo batendo.
                </span>
              </div>
            )}

            {porPosto.length > 0 && (
              <div className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed border border-status-warning/30 bg-status-warning/10 p-3">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <span>
                  {porPosto.length} {porPosto.length === 1 ? 'ativo continua' : 'ativos continuam'} no posto e
                  NÃO {porPosto.length === 1 ? 'é devolvido' : 'são devolvidos'}: {' '}
                  {porPosto.map((asset) => asset.assetTag).join(', ')}. Eles são do posto, não da pessoa —
                  quem continua lá segue respondendo por eles.
                </span>
              </div>
            )}

            <div className="space-y-1">
              <label className={ROTULO}>Status de volta dos ativos</label>
              <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Em branco, tudo volta ao estoque. Escolha quando o equipamento voltar para
                conferência ou conserto.
              </p>
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Observações</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex: desligamento em 23/09, equipamentos entregues na recepção."
                className={`${CLASSE_CAMPO} h-20 resize-none`}
              />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Fica na devolução de cada ativo e na trilha de auditoria do desligamento.
              </p>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="px-4 py-2 bg-status-danger text-bg-base hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {salvando ? 'Desligando...' : 'Confirmar desligamento'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Um passo da operação, com a lista do que ele alcança.
 *
 * A lista VAZIA continua aparecendo, com a frase "nada a fazer aqui": sumir com
 * o passo faria o modal parecer que a operação é outra dependendo da pessoa — e
 * é justamente o passo que ninguém espera (o do posto) o que sumiria mais vezes.
 */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const vazio = Array.isArray(children) && children.length === 0;

  return (
    <div className="border border-border-sutil">
      <div className={`${ROTULO} px-4 py-2 border-b border-border-sutil bg-bg-base/50`}>{titulo}</div>
      {vazio ? (
        <p className="px-4 py-2 text-text-tertiary">Nada a fazer aqui.</p>
      ) : (
        <ul className="divide-y divide-border-sutil/50 max-h-40 overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}
