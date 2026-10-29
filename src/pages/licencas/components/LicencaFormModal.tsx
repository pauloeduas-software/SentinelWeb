import { useState } from 'react';
import { X } from 'lucide-react';
import CampoDeDinheiro from '../../components/CampoDeDinheiro';
import ReferenceSelect from '../../components/ReferenceSelect';
import ChavesDoFormulario from './ChavesDoFormulario';
import { hojeNoCampoDeData, paraCampoDeData } from '../../helpers/format.helper';
import { useLicenseQuery } from '../../../domain/license/license.queries';
import type {
  ChaveDaLicenca, ChaveNoFormulario, Licenca, LicencaDetalhe, LicencaInput,
} from '../../../domain/shared/license.types';
import type { LinhaDeChave } from '../helpers/licenca.helper';

// Cadastro e edição de uma licença.
//
// ─────────────────────────────────────────────────────────────────────────────
// A QUANTIDADE É EDITÁVEL, e é o NÚMERO DO CONTRATO: alguém comprou mais, e
// digitar isso É a operação. Reduzir não passa do que está em uso — o servidor
// responde 409 com o número, e a frase embaixo do campo diz o piso antes de
// alguém tentar.
//
// NA EDIÇÃO, A LICENÇA VEM DO DETALHE, e não da linha da listagem: é o detalhe
// que traz as chaves de produto (a listagem não as devolve). E da busca FEITA
// NESTA ABERTURA, não do cache: o detalhe guardado de uma visita anterior pode
// ser de antes de um Encerrar ou da edição de outra pessoa, e o formulário
// inteiro o gravaria de volta — reabrindo a licença sem ninguém pedir.
//
// NA EDIÇÃO, O FORMULÁRIO INTEIRO VAI AO SERVIDOR, como nas Configurações (AF).
// O preço, declarado: o formulário aberto há tempo desfaz a edição que outra
// pessoa salvou no meio. O servidor continua barrando o que quebra regra.
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
  /** O corpo inteiro, no cadastro e na edição. */
  onSubmit: (data: LicencaInput) => Promise<void>;
}

/** Uma chave como o servidor a recebe. */
function chaveParaEnvio(chave: { id?: string; productKey: string; seats: number }): ChaveNoFormulario {
  return { ...(chave.id ? { id: chave.id } : {}), productKey: chave.productKey, seats: chave.seats };
}

/** Uma chave gravada como linha do formulário. */
function comoLinha(chave: ChaveDaLicenca): LinhaDeChave {
  return {
    uid: chave.id, id: chave.id, productKey: chave.productKey, seats: String(chave.seats),
    emUso: chave.emUso,
  };
}

export default function LicencaFormModal({ licenca, onClose, onSubmit }: LicencaFormModalProps) {
  if (!licenca) return <Formulario licenca={null} onClose={onClose} onSubmit={onSubmit} />;
  return <EdicaoDaLicenca id={licenca.id} onClose={onClose} onSubmit={onSubmit} />;
}

/** A edição espera o detalhe chegar: o formulário nasce com as chaves já preenchidas. */
function EdicaoDaLicenca({ id, onClose, onSubmit }: Omit<LicencaFormModalProps, 'licenca'> & { id: string }) {
  // `isFetchedAfterMount`: o que estava no cache aparece na hora, mas o
  // formulário só nasce com o que a busca desta abertura trouxe.
  const { data, error, isFetchedAfterMount } = useLicenseQuery(id);
  if (data && isFetchedAfterMount && !error) return <Formulario licenca={data} onClose={onClose} onSubmit={onSubmit} />;

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
  // A versão DESTA abertura (AF): o registro pode chegar mais novo enquanto o
  // formulário está aberto, e o que ele mostra continua sendo o desta leitura.
  const [versao] = useState(licenca?.updatedAt);

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
  const [chaves, setChaves] = useState<LinhaDeChave[]>(() => licenca?.keys.map(comoLinha) ?? []);

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

    // A linha NOVA deixada em branco não é chave: sai sem aviso. A que já existia
    // e ficou em branco pede o ✕ — apagar o texto não é o jeito de tirá-la.
    // As posições são as da tela, contando a linha em branco.
    const semTexto = chaves.findIndex((linha) => linha.id && linha.productKey.trim() === '');
    if (semTexto >= 0) {
      setErro(`A chave ${semTexto + 1} ficou em branco. Para tirá-la, use o ✕.`);
      return;
    }
    const semCobre = chaves.findIndex((linha) => {
      const cobre = Number(linha.seats);
      return linha.productKey.trim() !== ''
        && (linha.seats.trim() === '' || !Number.isInteger(cobre) || cobre < 1);
    });
    if (semCobre >= 0) {
      setErro(`Informe quantas licenças a chave ${semCobre + 1} cobre: um número inteiro, 1 ou mais.`);
      return;
    }
    const preenchidas = chaves.filter((linha) => linha.productKey.trim() !== '');

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
      keys: preenchidas.map((linha) => chaveParaEnvio({
        id: linha.id, productKey: linha.productKey.trim(), seats: Number(linha.seats),
      })),
      ...(versao ? { updatedAt: versao } : {}),
    };

    try {
      await onSubmit(dados);
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor — é aqui que aparecem o
      // 422 de categoria do tipo errado, o 409 de reduzir abaixo do que está
      // em uso ou do que as chaves cobrem, e o 422 da chave repetida.
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
              {!editando && (
                <span className="block text-[10px] text-text-tertiary leading-relaxed">
                  O Windows ou o Office que veio de fábrica no computador (OEM) não entra aqui: é do
                  computador, e não passa para outro.
                </span>
              )}
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
              <span className="block text-[10px] text-text-tertiary">
                Até quando pode usar: vencida, não recebe entrega. Renovou? Mude esta data — quem está
                com ela continua. A perpétua fica sem vencimento, e o fim do suporte vai nas notas.
              </span>
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Encerramento</span>
              <input type="date" max={hojeNoCampoDeData()} value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} className={CLASSE_CAMPO} />
              <span className="block text-[10px] text-text-tertiary">
                O dia em que o contrato acabou, mesmo que o vencimento fosse depois. Só com
                tudo devolvido. Apagar a data reabre a licença.
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
              <span className="block text-[10px] text-text-tertiary">
                O pedido ou a nota fiscal: é por ele que se acha o comprovante, e a busca encontra a
                licença por este número.
              </span>
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Data da compra</span>
              <input type="date" max={hojeNoCampoDeData()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5">
              <span className={ROTULO}>Valor da compra</span>
              <CampoDeDinheiro valor={purchaseCost} onChange={setPurchaseCost} className={CLASSE_CAMPO} />
            </label>

            <label className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Notas</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
            </label>

            <div className="space-y-1.5 col-span-2">
              <span className={ROTULO}>Chaves do produto</span>
              <ChavesDoFormulario
                linhas={chaves}
                compradas={Number.isInteger(Number(seatsTotal)) && seatsTotal.trim() !== '' ? Number(seatsTotal) : null}
                onChange={setChaves}
                classeCampo={CLASSE_CAMPO}
              />
            </div>
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
