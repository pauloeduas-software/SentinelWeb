import { useState } from 'react';
import CampoDeDinheiro from '../../../components/CampoDeDinheiro';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import ChavesDoFormulario from './ChavesDoFormulario';
import { hojeNoCampoDeData, paraCampoDeData } from '../../../helpers/format.helper';
import { useLicenseQuery } from '../../../queries/license.queries';
import type {
  ChaveDaLicenca, ChaveNoFormulario, Licenca, LicencaDetalhe, LicencaInput,
} from '../../../types/license.types';
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
    <FormularioLateral
      titulo="Editar licença"
      largura="lg"
      onClose={onClose}
      onSubmit={(evento) => evento.preventDefault()}
      erro={error ? `Não foi possível carregar a licença: ${error.message}` : undefined}
      bloqueado
    >
      {!error && <p className="text-sm text-text-tertiary">Carregando…</p>}
    </FormularioLateral>
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
    <FormularioLateral
      titulo={editando ? 'Editar licença' : 'Nova licença'}
      largura="lg"
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Nome"
          obrigatorio
          className="sm:col-span-2"
          ajuda={editando ? undefined : 'O Windows ou o Office que veio de fábrica no computador (OEM) não entra aqui: é do computador, e não passa para outro.'}
        >
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Campo>

        {/* Filtrada por TIPO: o seletor não oferece categoria de ativo, porque o
            servidor a recusaria com 422. */}
        <Campo rotulo="Categoria" obrigatorio>
          <ReferenceSelect rota="categories" filtroTipo="LICENSE" valor={categoryId} obrigatorio atual={licenca?.category} onChange={setCategoryId} />
        </Campo>

        <Campo rotulo="Fabricante">
          <ReferenceSelect rota="manufacturers" valor={manufacturerId} atual={licenca?.manufacturer} onChange={setManufacturerId} />
        </Campo>

        <Campo
          rotulo="Quantidade comprada"
          obrigatorio
          className="sm:col-span-2"
          ajuda={licenca && licenca.emUso > 0 ? `O mínimo é ${licenca.emUso}: é o que está em uso.` : undefined}
        >
          <Input
            required type="number" min={1} step={1} value={seatsTotal}
            onChange={(e) => setSeatsTotal(e.target.value)}
          />
        </Campo>

        <Campo
          rotulo="Vencimento"
          ajuda="Vencida não recebe entrega. Renovou? Mude esta data, e quem está com ela continua. A perpétua fica sem vencimento, e o fim do suporte vai nas notas."
        >
          <Input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
        </Campo>

        <Campo
          rotulo="Encerramento"
          ajuda="O dia em que o contrato acabou, mesmo que o vencimento fosse depois. Só com tudo devolvido. Apagar a data reabre a licença."
        >
          <Input type="date" max={hojeNoCampoDeData()} value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
        </Campo>

        <Campo rotulo="Licenciado para">
          <Input value={licensedToName} onChange={(e) => setLicensedToName(e.target.value)} />
        </Campo>

        <Campo rotulo="E-mail do licenciado">
          <Input type="email" value={licensedToEmail} onChange={(e) => setLicensedToEmail(e.target.value)} />
        </Campo>

        <Campo
          rotulo="Número do pedido"
          className="sm:col-span-2"
          ajuda="O pedido ou a nota fiscal: a busca encontra a licença por este número."
        >
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </Campo>

        <Campo rotulo="Data da compra">
          <Input type="date" max={hojeNoCampoDeData()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Campo>

        <Campo rotulo="Valor da compra">
          <CampoDeDinheiro valor={purchaseCost} onChange={setPurchaseCost} />
        </Campo>

        <Campo rotulo="Notas" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Campo>

        {/* Sem `Campo`: ele daria o mesmo id a todas as linhas. Cada uma tem o seu `aria-label`. */}
        <div className="space-y-1.5 sm:col-span-2">
          <span className="block text-sm font-medium text-text-primary">Chaves do produto</span>
          <ChavesDoFormulario
            linhas={chaves}
            compradas={Number.isInteger(Number(seatsTotal)) && seatsTotal.trim() !== '' ? Number(seatsTotal) : null}
            onChange={setChaves}
          />
        </div>
      </div>
    </FormularioLateral>
  );
}
