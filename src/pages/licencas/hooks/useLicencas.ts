import { useMemo, useState } from 'react';
import {
  useCheckinSeat, useCheckoutSeat, useCreateLicense, useDeleteLicense,
  useLicenseAlertsQuery, useLicensesQuery, useRestoreLicense, useUpdateLicense,
} from '../../../domain/license/license.queries';
import type {
  AlvoDoAssento, Licenca, LicencaInput,
} from '../../../domain/shared/license.types';
import type { ListView } from '../../../domain/shared/list.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
export type ModalDeLicenca = 'criar' | 'editar' | 'detalhe' | 'entregar' | null;

/**
 * Os números do contrato NA HORA DO CLIQUE, para a frase da confirmação.
 *
 * Vem de quem desenhou a grade — `null` significa "não queima, não pergunte".
 * Um booleano aqui obrigaria este hook a adivinhar os números, e o único lugar
 * que os tem frescos é a janela de detalhe.
 */
export interface AvisoDeQueima {
  seatsTotal: number;
  queimados: number;
}

// Estado da tela de Licenças: página, busca, vista e qual licença está aberta.
// Tudo de UMA tela — `useState`, não store (docs/ARQUITETURA.md).
export function useLicencas() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ListView>('active');
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o recorte, e não num `useEffect`
  // reagindo a ele: `setState` dentro de efeito encadeia renders e o lint do
  // react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeView = (proxima: ListView) => {
    setView(proxima);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, view, q: debouncedSearch || undefined }),
    [page, view, debouncedSearch],
  );

  const { data, isPending } = useLicensesQuery(params);
  const licencas = data?.rows ?? [];
  const { data: alertas } = useLicenseAlertsQuery();

  const criar = useCreateLicense();
  const editar = useUpdateLicense();
  const excluir = useDeleteLicense();
  const restaurar = useRestoreLicense();
  const entregar = useCheckoutSeat();
  const devolver = useCheckinSeat();

  const [modal, setModal] = useState<ModalDeLicenca>(null);
  // A LICENÇA ABERTA é guardada como a LINHA inteira, não só o id: a janela
  // precisa do nome e das contagens para desenhar o cabeçalho no primeiro
  // quadro, e a consulta do detalhe chega depois.
  const [licencaAberta, setLicencaAberta] = useState<Licenca | null>(null);

  const abrir = (proximo: ModalDeLicenca, licenca: Licenca | null = null) => {
    setLicencaAberta(licenca);
    setModal(proximo);
  };

  const fechar = () => {
    setModal(null);
    setLicencaAberta(null);
  };

  // Os erros sobem para o formulário mostrar a mensagem do servidor — é por
  // aqui que aparecem o 422 de categoria do tipo errado, o 422 de chave sem
  // criptografia configurada e o 409 de reduzir o contrato abaixo do ocupado.
  const handleCriar = async (dados: LicencaInput) => {
    await criar.mutateAsync(dados);
    fechar();
  };

  const handleEditar = async (dados: Partial<LicencaInput>) => {
    if (!licencaAberta) return;
    await editar.mutateAsync({ id: licencaAberta.id, data: dados });
    fechar();
  };

  const handleEntregar = async (alvo: AlvoDoAssento) => {
    if (!licencaAberta) return;
    await entregar.mutateAsync({ licenseId: licencaAberta.id, alvo });
    fechar();
  };

  /**
   * A DEVOLUÇÃO — e ela pode DESTRUIR VALOR.
   *
   * Quando `reassignable = false`, devolver QUEIMA o assento: ele não volta ao
   * contrato. Por isso este é o único handler da tela com confirmação, e a
   * confirmação diz o NÚMERO que vai sobrar — "restarão 4 de 5 utilizáveis" é
   * a informação que faz alguém parar; "tem certeza?" não é.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * O NÚMERO É `seatsTotal − queimados − 1`, E NÃO `livres`.
   *
   * UTILIZÁVEL é o que não queimou: `seatsTotal − queimados` (o aposentado já
   * saiu de `seatsTotal` quando o contrato encolheu, D92). Este assento está
   * OCUPADO agora — devolvê-lo e queimá-lo tira um dos utilizáveis e não muda
   * `livres`, que continua sendo o que já estava vazio.
   *
   * Usar `livres` acertava por coincidência quando havia exatamente UM assento
   * ocupado, e mentia em todo o resto: num contrato de 5 com 3 ocupados e 2
   * livres, o aviso prometia "restarão 2" quando restam 4.
   *
   * E os números vêm de quem está OLHANDO a grade (o detalhe, que refaz a
   * consulta), não da linha da listagem capturada quando o modal abriu: depois
   * de duas devoluções na mesma janela, aquela linha já está velha.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  const handleDevolver = async (seatId: string, queima: AvisoDeQueima | null) => {
    if (queima) {
      const restarao = Math.max(queima.seatsTotal - queima.queimados - 1, 0);
      const ok = window.confirm(
        `Esta licença NÃO é reatribuível: devolver este assento o QUEIMA, e ele não volta ao contrato.\n\n`
        + `Restarão ${restarao} de ${queima.seatsTotal} assentos utilizáveis.\n\n`
        + 'Isto não tem volta. Continuar?',
      );
      if (!ok) return;
    }

    try {
      await devolver.mutateAsync({ seatId });
    } catch (erro) {
      // O 409 de assento não ocupado: duas abas abertas na mesma grade, a
      // segunda perde.
      alert((erro as Error).message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR E RESTAURAR precisam do `try/catch`: o clique é direto na linha da
  // tabela e não há campo de erro para a mensagem subir. Sem ele a rejeição
  // vira *unhandled rejection* e a tela não faz NADA — o operador clica em
  // "Lixeira" numa licença com assento ocupado, nada acontece, e ele clica de
  // novo. O 409 daqui é escrito para ensinar, e engoli-lo transforma uma recusa
  // explicada numa tela que parece travada.
  //
  // `alert` é o mesmo do `useEstoque`/`useAssets` — feio e consistente.
  // ─────────────────────────────────────────────────────────────────────────

  const handleExcluir = async (licenca: Licenca) => {
    try {
      await excluir.mutateAsync(licenca.id);
      // Última linha da página: volta uma, senão a tabela abre vazia com o
      // paginador apontando para uma página que não existe mais.
      if (licencas.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      alert((erro as Error).message);
    }
  };

  const handleRestaurar = async (licenca: Licenca) => {
    try {
      await restaurar.mutateAsync(licenca.id);
      if (licencas.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // O 409 de nome reaproveitado enquanto a licença estava na lixeira: a
      // unicidade é índice PARCIAL, só entre as vivas.
      alert((erro as Error).message);
    }
  };

  return {
    licencas,
    total: data?.total ?? 0,
    carregando: isPending,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,

    alertas: alertas ?? { vencendo: [], assentosBaixos: [] },

    modal,
    licencaAberta,
    abrir,
    fechar,

    handleCriar,
    handleEditar,
    handleEntregar,
    handleDevolver,
    handleExcluir,
    handleRestaurar,
  };
}
