import { useState } from 'react';
import { ArrowRightLeft, HardDrive, MapPin, TriangleAlert, Undo2, User, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { montarDevolucao, montarEntrega, resumoDaPosse, type ResumoPosse } from '../helpers/posse.helper';
import type { CheckinInput, CheckoutInput } from '../../../domain/assignment/assignment.queries';
import type { Asset } from '../../../domain/shared/asset.types';
import type { AlvoDaPosse } from '../../../domain/shared/posse.types';

// ENTREGAR e DEVOLVER — a única porta pela qual a posse de um ativo muda
// (docs/MODELO-POSSE.md).
//
// O modal tem DOIS estados, decididos pelo dado e não por quem clicou: ativo com
// posse aberta só aceita devolução; sem posse aberta, entrega. É o mesmo botão
// na listagem porque é a mesma decisão vista dos dois lados — e porque oferecer
// "entregar" para um ativo já entregue convidaria ao duplo checkout, que o
// índice único parcial do banco recusaria com um erro sem explicação.
//
// Como todo componente desta pasta, não fala HTTP: recebe `onEntregar` e
// `onDevolver` por prop. O `ReferenceSelect` é a exceção documentada — busca as
// opções pela query do domínio, nunca por `apiClient`.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

/**
 * As TRÊS abas do seletor de alvo. Cada uma é um `targetType` do contrato, e a
 * `ajuda` explica a diferença no momento da escolha — que é quando a dúvida
 * aparece, e é o mesmo padrão dos `<select>` de Configurações.
 *
 * `rota` é o slug de `/options`. Para pessoas é `users` (GET /api/users/options,
 * server/domain/user/user.maestro.ts) — não `people` nem `colaboradores`.
 */
const ABAS: readonly {
  tipo: AlvoDaPosse;
  rotulo: string;
  icone: typeof User;
  rota: string;
  rotuloAlvo: string;
  ajuda: string;
}[] = [
  {
    tipo: 'USER',
    rotulo: 'Pessoa',
    icone: User,
    rota: 'users',
    rotuloAlvo: 'Colaborador',
    ajuda: 'A posse fica no nome dela: um responsável, direto. É o caso simples.',
  },
  {
    tipo: 'LOCATION',
    rotulo: 'Posto',
    icone: MapPin,
    rota: 'locations',
    rotuloAlvo: 'Localização',
    ajuda: 'A posse fica no LUGAR. Quem responde são os ocupantes dele — podem ser vários, em turnos diferentes. Os ocupantes de cada posto se gerenciam em Configurações › Localizações.',
  },
  {
    tipo: 'ASSET',
    rotulo: 'Ativo',
    icone: HardDrive,
    // Espelho de `/api/assets/options`, a rota de opções de ativo da F4. As
    // outras duas já existem; esta chega junto com o checkout no servidor.
    rota: 'assets',
    rotuloAlvo: 'Ativo detentor',
    ajuda: 'O ativo passa a acompanhar outro — a dock presa ao notebook. Quem responde por ele é quem responde pelo ativo detentor.',
  },
];

interface CheckoutModalProps {
  asset: Asset;
  onClose: () => void;
  onEntregar: (data: CheckoutInput) => Promise<void>;
  onDevolver: (data: CheckinInput) => Promise<void>;
}

export default function CheckoutModal({ asset, onClose, onEntregar, onDevolver }: CheckoutModalProps) {
  const posse = resumoDaPosse(asset.posse);

  const [aba, setAba] = useState<AlvoDaPosse>('USER');
  const [alvoId, setAlvoId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [expectedCheckinAt, setExpectedCheckinAt] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const abaAtual = ABAS.find((item) => item.tipo === aba) ?? ABAS[0];

  // Trocar de aba ZERA o alvo: o corpo leva UMA FK, e um id que sobrou da aba
  // anterior seria um alvo que o usuário não escolheu mais.
  const trocarAba = (proxima: AlvoDaPosse) => {
    setAba(proxima);
    setAlvoId('');
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      if (posse.entregue) {
        await onDevolver(montarDevolucao({ statusId, checkinNotes: observacoes }));
      } else {
        await onEntregar(montarEntrega({
          targetType: aba, alvoId, statusId, expectedCheckinAt, checkoutNotes: observacoes,
        }));
      }
    } catch (falha) {
      // Mutação propaga: o erro do servidor aparece aqui, já traduzido pelo
      // apiClient (duplo checkout, ativo indisponível, alvo inexistente).
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            {posse.entregue ? <Undo2 size={16} /> : <ArrowRightLeft size={16} />}
            {posse.entregue ? 'Devolver' : 'Entregar'} {asset.assetTag}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <p className="text-text-tertiary text-[10px] leading-relaxed">
            {asset.model.manufacturer.name} {asset.model.name}
            {asset.serial && <> · SN {asset.serial}</>}
          </p>

          {posse.entregue ? (
            <PosseAtual posse={posse} />
          ) : (
            <>
              <div className="flex flex-wrap border border-border-sutil">
                {ABAS.map((item) => (
                  <button
                    key={item.tipo}
                    type="button"
                    onClick={() => trocarAba(item.tipo)}
                    className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
                      item.tipo === aba
                        ? 'bg-text-primary text-bg-base'
                        : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
                    }`}
                  >
                    <item.icone size={14} /> {item.rotulo}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label className={ROTULO}>{abaAtual.rotuloAlvo}*</label>
                <ReferenceSelect
                  // Remontar a cada aba é de propósito: cada alvo é uma lista
                  // diferente, e a `key` evita que o `<select>` da aba anterior
                  // apareça por um quadro com as opções velhas.
                  key={abaAtual.tipo}
                  rota={abaAtual.rota}
                  valor={alvoId}
                  obrigatorio
                  // Um ativo não pode ser detentor de si mesmo. A cadeia mais
                  // longa (A → B → A) é barrada pelo servidor.
                  excluirId={abaAtual.tipo === 'ASSET' ? asset.id : undefined}
                  onChange={setAlvoId}
                />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">{abaAtual.ajuda}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={ROTULO}>Status após a entrega</label>
                  <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
                  <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                    Em branco, o servidor aplica o status de uso.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className={ROTULO}>Devolução prevista</label>
                  <input
                    type="date"
                    value={expectedCheckinAt}
                    onChange={(event) => setExpectedCheckinAt(event.target.value)}
                    className={CLASSE_CAMPO}
                  />
                  <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                    Só para empréstimo com prazo. Em branco, é entrega sem data de volta.
                  </p>
                </div>
              </div>
            </>
          )}

          {posse.entregue && (
            <div className="space-y-1">
              <label className={ROTULO}>Status de volta</label>
              <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Para onde o ativo volta: estoque, conserto, inutilizável. Em branco, o servidor decide.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className={ROTULO}>Observações {posse.entregue ? 'da devolução' : 'da entrega'}</label>
            <textarea
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              placeholder={posse.entregue ? 'Ex: devolvido com a fonte, sem a maleta.' : 'Ex: entregue com dock e headset.'}
              className={`${CLASSE_CAMPO} h-20 resize-none`}
            />
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
              disabled={salvando || (!posse.entregue && !alvoId)}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando
                ? (posse.entregue ? 'Devolvendo...' : 'Entregando...')
                : (posse.entregue ? 'Confirmar devolução' : 'Confirmar entrega')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Com quem o ativo está hoje — o que a devolução precisa mostrar ANTES de
 * pedir qualquer campo. Sem isto, "devolver" seria um botão sem contexto.
 */
function PosseAtual({ posse }: { posse: ResumoPosse }) {
  // Sem responsável resolvido, mostrar para QUEM foi entregue ainda é melhor que
  // não mostrar nada: é o posto vazio, e é o que explica a devolução.
  const comQuem = posse.responsaveis || posse.alvo;

  return (
    <div className="border border-border-sutil bg-bg-base/50 p-4 space-y-2">
      <div className={ROTULO}>Hoje está com</div>

      <div className="text-text-primary">
        {comQuem || <span className="text-text-tertiary">ninguém responde por ele</span>}
      </div>

      {posse.detalheAlvo && (
        <div className="text-text-tertiary text-[10px]">{posse.detalheAlvo}</div>
      )}

      {posse.postoVago && (
        <div className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          <span>
            Posto sem ocupante aberto: o ativo está parado numa mesa vazia. Devolver ao estoque
            ou colocar alguém no posto, em Configurações › Localizações.
          </span>
        </div>
      )}
    </div>
  );
}
