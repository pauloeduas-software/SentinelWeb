import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { paraCampoDeData } from '../../helpers/format.helper';
import type { Licenca, LicencaInput } from '../../../domain/shared/license.types';

// Cadastro e edição de uma licença.
//
// ─────────────────────────────────────────────────────────────────────────────
// `seatsTotal` É EDITÁVEL, ao contrário do `qty` do estoque — e a diferença é
// real: `qty` é consequência de movimentação (chegou nota, quebrou), enquanto
// `seatsTotal` é o NÚMERO DO CONTRATO. Alguém comprou mais assentos, e digitar
// isso É a operação.
//
// O que o servidor garante é que ele nunca muda sozinho: a reconciliação cria
// ou aposenta linhas na MESMA transação, e reduzir abaixo do que está ocupado
// responde 409 com os números. A frase embaixo do campo diz isso, porque quem
// reduz um contrato precisa saber antes de tentar.
// ─────────────────────────────────────────────────────────────────────────────
//
// A CHAVE DE PRODUTO entra aqui e NUNCA volta: o campo nasce vazio inclusive na
// edição. Preenchê-lo com a máscara convidaria alguém a salvar o formulário sem
// tocar no campo e gravar `••••-••••-AB12` como se fosse a chave.

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
  onSubmit: (data: LicencaInput) => Promise<void>;
}

export default function LicencaFormModal({ licenca, onClose, onSubmit }: LicencaFormModalProps) {
  const editando = licenca !== null;

  const [name, setName] = useState(licenca?.name ?? '');
  const [categoryId, setCategoryId] = useState(licenca?.categoryId ?? '');
  const [seatsTotal, setSeatsTotal] = useState(licenca ? String(licenca.seatsTotal) : '1');
  const [minSeats, setMinSeats] = useState(licenca?.minSeats != null ? String(licenca.minSeats) : '');
  const [reassignable, setReassignable] = useState(licenca?.reassignable ?? true);
  const [maintained, setMaintained] = useState(licenca?.maintained ?? false);
  const [expirationDate, setExpirationDate] = useState(paraCampoDeData(licenca?.expirationDate));
  const [terminationDate, setTerminationDate] = useState(paraCampoDeData(licenca?.terminationDate));
  const [licensedToName, setLicensedToName] = useState(licenca?.licensedToName ?? '');
  const [licensedToEmail, setLicensedToEmail] = useState(licenca?.licensedToEmail ?? '');
  // Sempre vazio, inclusive na edição — ver o bloco no topo do arquivo.
  const [productKey, setProductKey] = useState('');
  const [manufacturerId, setManufacturerId] = useState(licenca?.manufacturerId ?? '');
  const [supplierId, setSupplierId] = useState(licenca?.supplierId ?? '');
  const [orderNumber, setOrderNumber] = useState(licenca?.orderNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState(paraCampoDeData(licenca?.purchaseDate));
  // STRING do começo ao fim: converter para `number` aqui é como o erro de
  // centavo entra (a coluna é `Decimal`).
  const [purchaseCost, setPurchaseCost] = useState(licenca?.purchaseCost ?? '');
  const [notes, setNotes] = useState(licenca?.notes ?? '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    const dados: LicencaInput = {
      name: name.trim(),
      categoryId,
      seatsTotal: Number(seatsTotal) || 0,
      minSeats: minSeats.trim() === '' ? null : Number(minSeats),
      reassignable,
      maintained,
      expirationDate: limpar(expirationDate),
      terminationDate: limpar(terminationDate),
      licensedToName: limpar(licensedToName),
      licensedToEmail: limpar(licensedToEmail),
      manufacturerId: limpar(manufacturerId),
      supplierId: limpar(supplierId),
      orderNumber: limpar(orderNumber),
      purchaseDate: limpar(purchaseDate),
      purchaseCost: limpar(purchaseCost),
      notes: limpar(notes),
    };

    // A CHAVE SÓ VAI QUANDO FOI DIGITADA. Campo vazio na edição significa
    // "não mexe na chave" — mandar `null` apagaria a que já existe, e o
    // formulário não tem como saber se o vazio foi intenção ou descuido.
    // Quem quer apagar usa o botão próprio, no detalhe.
    if (productKey.trim() !== '') dados.productKey = productKey.trim();

    try {
      await onSubmit(dados);
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor — é aqui que aparecem o
      // 422 de categoria do tipo errado, o 422 de chave sem criptografia
      // configurada e o 409 de reduzir o contrato abaixo do ocupado.
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
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
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
                className={CLASSE_CAMPO} placeholder="Office 2024"
              />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Categoria *</span>
              {/* Filtrada por TIPO: o `<select>` não oferece categoria de ativo,
                  porque o servidor a recusaria com 422. */}
              <ReferenceSelect rota="categories" filtroTipo="LICENSE" valor={categoryId} obrigatorio onChange={setCategoryId} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Fabricante</span>
              <ReferenceSelect rota="manufacturers" valor={manufacturerId} onChange={setManufacturerId} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Total de assentos *</span>
              <input
                required type="number" min={0} value={seatsTotal}
                onChange={(e) => setSeatsTotal(e.target.value)} className={CLASSE_CAMPO}
              />
              <span className="block text-[10px] text-text-tertiary leading-relaxed">
                Os assentos são criados ou aposentados na mesma gravação. Reduzir abaixo do que
                está ocupado é recusado — devolva antes.
              </span>
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Mínimo de livres</span>
              <input
                type="number" min={0} value={minSeats}
                onChange={(e) => setMinSeats(e.target.value)} className={CLASSE_CAMPO}
                placeholder="em branco = não alerta"
              />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Vencimento</span>
              <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Encerramento</span>
              <input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} className={CLASSE_CAMPO} />
              <span className="block text-[10px] text-text-tertiary">
                Rescisão do contrato. A partir dessa data a licença fica ENCERRADA mesmo que o
                vencimento seja depois — e uma data futura não encerra nada hoje.
              </span>
            </label>

            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Chave de produto</span>
              <input
                value={productKey} onChange={(e) => setProductKey(e.target.value)}
                className={CLASSE_CAMPO} autoComplete="off"
                placeholder={licenca?.hasProductKey ? 'já cadastrada — preencha só para substituir' : 'AAAA-BBBB-CCCC-DDDD'}
              />
              <span className="block text-[10px] text-text-tertiary leading-relaxed">
                Cifrada em repouso. Depois de salva ela nunca mais aparece na tela inteira — só
                mascarada, e revelá-la fica registrado no histórico.
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
              <span className={ROTULO}>Fornecedor</span>
              <ReferenceSelect rota="suppliers" valor={supplierId} onChange={setSupplierId} />
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
              <input value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} className={CLASSE_CAMPO} placeholder="1234.50" />
            </label>

            <div className="col-span-2 flex flex-wrap gap-6 py-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={reassignable} onChange={(e) => setReassignable(e.target.checked)} />
                <span className="text-text-secondary">Reatribuível</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={maintained} onChange={(e) => setMaintained(e.target.checked)} />
                <span className="text-text-secondary">Com manutenção</span>
              </label>
            </div>

            {!reassignable && (
              // O aviso aparece no momento em que a caixa é desmarcada, não
              // depois — quando o assento já queimou não há o que fazer.
              <p className="col-span-2 p-2.5 bg-status-warning/10 border border-status-warning/20 text-status-warning text-[10px] leading-relaxed">
                Licença não reatribuível: todo assento DEVOLVIDO é queimado e não volta ao
                contrato. Isso vale também para a devolução automática do desligamento.
              </p>
            )}

            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Notas</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
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
