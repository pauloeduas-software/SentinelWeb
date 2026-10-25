import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { paraCampoDeData } from '../../helpers/format.helper';
import { useLicenseQuery } from '../../../domain/license/license.queries';
import type { Licenca, LicencaDetalhe, LicencaInput } from '../../../domain/shared/license.types';
import { camposAlterados } from '../helpers/licenca.helper';

// Cadastro e edição de uma licença.
//
// ─────────────────────────────────────────────────────────────────────────────
// A QUANTIDADE É EDITÁVEL, e é o NÚMERO DO CONTRATO: alguém comprou mais, e
// digitar isso É a operação. Reduzir não passa do que está em uso — o servidor
// responde 409 com o número, e a frase embaixo do campo diz o piso antes de
// alguém tentar.
//
// NA EDIÇÃO, A LICENÇA VEM DO DETALHE, e não da linha da listagem: é o detalhe
// que traz a chave de produto (a listagem não a devolve), e ele chega fresco.
//
// NA EDIÇÃO, SÓ O QUE MUDOU VAI AO SERVIDOR (`camposAlterados`): o formulário
// aberto há tempo não desfaz a edição que outra pessoa salvou no meio.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

function limpar(valor: string): string | null {
  const texto = valor.trim();
  return texto === '' ? null : texto;
}

interface LicencaFormModalProps {
  /** Preenchido = edição. `null` = cadastro. */
  licenca: Licenca | null;
  onClose: () => void;
  /** No cadastro, o corpo inteiro; na edição, só o que mudou. */
  onSubmit: (data: LicencaInput) => Promise<void>;
}

/** O formulário como o servidor devolveu a licença — a base da comparação na edição. */
function comoFoiSalva(licenca: LicencaDetalhe): LicencaInput {
  return {
    name: licenca.name,
    categoryId: licenca.categoryId,
    seatsTotal: licenca.seatsTotal,
    expirationDate: licenca.expirationDate,
    terminationDate: licenca.terminationDate,
    licensedToName: licenca.licensedToName,
    licensedToEmail: licenca.licensedToEmail,
    manufacturerId: licenca.manufacturerId,
    orderNumber: licenca.orderNumber,
    purchaseDate: licenca.purchaseDate,
    purchaseCost: licenca.purchaseCost,
    notes: licenca.notes,
    productKey: licenca.productKey,
  };
}

export default function LicencaFormModal({ licenca, onClose, onSubmit }: LicencaFormModalProps) {
  if (!licenca) return <Formulario licenca={null} onClose={onClose} onSubmit={onSubmit} />;
  return <EdicaoDaLicenca id={licenca.id} onClose={onClose} onSubmit={onSubmit} />;
}

/** A edição espera o detalhe chegar: o formulário nasce com a chave já preenchida. */
function EdicaoDaLicenca({ id, onClose, onSubmit }: Omit<LicencaFormModalProps, 'licenca'> & { id: string }) {
  const { data, error } = useLicenseQuery(id);
  if (data) return <Formulario licenca={data} onClose={onClose} onSubmit={onSubmit} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface-card border border-border-sutil p-6 font-mono text-xs space-y-4">
        {error
          ? <p role="alert" className="text-status-danger">Não foi possível carregar a licença: {error.message}</p>
          : <p className="text-text-tertiary">Carregando…</p>}
        <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest transition-colors">
          Fechar
        </button>
      </div>
    </div>
  );
}

function Formulario({ licenca, onClose, onSubmit }: Omit<LicencaFormModalProps, 'licenca'> & { licenca: LicencaDetalhe | null }) {
  const editando = licenca !== null;

  const [name, setName] = useState(licenca?.name ?? '');
  const [categoryId, setCategoryId] = useState(licenca?.categoryId ?? '');
  const [seatsTotal, setSeatsTotal] = useState(licenca ? String(licenca.seatsTotal) : '1');
  const [expirationDate, setExpirationDate] = useState(paraCampoDeData(licenca?.expirationDate));
  const [terminationDate, setTerminationDate] = useState(paraCampoDeData(licenca?.terminationDate));
  const [licensedToName, setLicensedToName] = useState(licenca?.licensedToName ?? '');
  const [licensedToEmail, setLicensedToEmail] = useState(licenca?.licensedToEmail ?? '');
  const [manufacturerId, setManufacturerId] = useState(licenca?.manufacturerId ?? '');
  const [orderNumber, setOrderNumber] = useState(licenca?.orderNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState(paraCampoDeData(licenca?.purchaseDate));
  // STRING do começo ao fim: converter para `number` aqui é como o erro de
  // centavo entra (a coluna é `Decimal`).
  const [purchaseCost, setPurchaseCost] = useState(licenca?.purchaseCost ?? '');
  const [notes, setNotes] = useState(licenca?.notes ?? '');
  const [productKey, setProductKey] = useState(licenca?.productKey ?? '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');

    // A quantidade em branco não vira 0, e zero não é contrato: a licença que
    // acabou se encerra.
    const quantidade = Number(seatsTotal);
    if (seatsTotal.trim() === '' || !Number.isInteger(quantidade) || quantidade < 1) {
      setErro('Informe a quantidade comprada: um número inteiro, 1 ou mais.');
      return;
    }

    setSalvando(true);
    const dados: LicencaInput = {
      name: name.trim(),
      categoryId,
      seatsTotal: quantidade,
      expirationDate: limpar(expirationDate),
      terminationDate: limpar(terminationDate),
      licensedToName: limpar(licensedToName),
      licensedToEmail: limpar(licensedToEmail),
      manufacturerId: limpar(manufacturerId),
      orderNumber: limpar(orderNumber),
      purchaseDate: limpar(purchaseDate),
      purchaseCost: limpar(purchaseCost),
      notes: limpar(notes),
      productKey: limpar(productKey),
    };

    try {
      await onSubmit(licenca ? camposAlterados(comoFoiSalva(licenca), dados) as LicencaInput : dados);
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor — é aqui que aparecem o
      // 422 de categoria do tipo errado e o 409 de reduzir abaixo do que está
      // em uso.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {editando ? 'Editar licença' : 'Nova licença'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" title="Fechar" className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4 overflow-y-auto max-h-[75vh]">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Nome *</span>
              <input
                required value={name} onChange={(e) => setName(e.target.value)}
                className={CLASSE_CAMPO}
              />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Categoria *</span>
              {/* Filtrada por TIPO: o `<select>` não oferece categoria de ativo,
                  porque o servidor a recusaria com 422. */}
              <ReferenceSelect rota="categories" filtroTipo="LICENSE" valor={categoryId} obrigatorio atual={licenca?.category} onChange={setCategoryId} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Fabricante</span>
              <ReferenceSelect rota="manufacturers" valor={manufacturerId} atual={licenca?.manufacturer} onChange={setManufacturerId} />
            </label>

            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Quantidade comprada *</span>
              <input
                required type="number" min={1} step={1} value={seatsTotal}
                onChange={(e) => setSeatsTotal(e.target.value)} className={CLASSE_CAMPO}
              />
              {licenca && licenca.emUso > 0 && (
                <span className="block text-[10px] text-text-tertiary leading-relaxed">
                  O mínimo é {licenca.emUso}: é o que está em uso.
                </span>
              )}
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Vencimento</span>
              <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Encerramento</span>
              <input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} className={CLASSE_CAMPO} />
              <span className="block text-[10px] text-text-tertiary">
                O fim do contrato. No dia marcado a licença vai para Encerradas, mesmo que o
                vencimento seja depois. Com alguém usando, ela fica no alerta até tudo ser devolvido.
                Apagar a data reabre a licença.
              </span>
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Licenciado para</span>
              <input value={licensedToName} onChange={(e) => setLicensedToName(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>E-mail do licenciado</span>
              <input type="email" value={licensedToEmail} onChange={(e) => setLicensedToEmail(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Número do pedido</span>
              <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Data da compra</span>
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Valor da compra</span>
              <input value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="1234,56" className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Notas</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Chave do produto</span>
              <textarea
                rows={3} value={productKey} onChange={(e) => setProductKey(e.target.value)}
                spellCheck={false} autoComplete="off" className={`${CLASSE_CAMPO} font-mono`}
              />
              <span className="block text-[10px] text-text-tertiary leading-relaxed">
                A chave de volume, ou as chaves compradas, uma por linha. Só aparece no detalhe da
                licença, escondida até alguém pedir para mostrar.
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest transition-colors disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
