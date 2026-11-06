import { History, Info, Pencil, Power, PowerOff, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import ChaveEscondida from './ChaveEscondida';
import EntregasAbertas from './EntregasAbertas';
import HistoricoLicenca from './HistoricoLicenca';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import JanelaDeDetalhe from '../../../components/JanelaDeDetalhe';
import ListToolbar from '../../../components/ListToolbar';
import { Aviso } from '../../../components/ui/aviso';
import { PontoDeStatus } from '../../../components/ui/badge';
import { ContagemDaAba } from '../../../components/ui/tabs';
import { POR_PAGINA } from '../../../hooks/useListaNaUrl';
import { Button } from '../../../components/ui/button';
import { Dado, GradeDeDados } from '../../../components/ui/dado';
import {
  useLicenseCheckoutsQuery, useLicenseHistoryQuery, useLicenseQuery,
} from '../../../queries/license.queries';
import type { Licenca } from '../../../types/license.types';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  ROTULO_DO_STATUS, TOM_DO_STATUS, resumoDaContagem, textoDoPrazo, textoDoValorDaCompra,
} from '../../../helpers/licenca.helper';
import { formatarData } from '../../../helpers/format.helper';
import { lugarDaChave, motivoParaNaoEntregar } from '../helpers/licenca.helper';

// O DETALHE DA LICENÇA: o status, a conta e as ações em cima; nas abas, os campos
// do cadastro, quem está com ela agora e o histórico — as duas listas de 15 em 15.
//
// É A ÚNICA TELA COM AS CHAVES DE PRODUTO: as da licença, no topo da aba Dados,
// numeradas e com quanto cada uma cobre, e a de cada entrega, em "Com quem está" —
// todas escondidas até "Mostrar" (AC).

interface LicencaDetalheModalProps {
  licenca: Licenca;
  ocupado: boolean;
  onClose: () => void;
  onEntregar: (licenca: Licenca) => void;
  /** Editar, encerrar e reabrir são `SUPERVISOR` no servidor (AV). Ausentes, os botões somem. */
  onEditar?: (licenca: Licenca) => void;
  /** Encerrar e reabrir — o mesmo botão, pelo status da licença. */
  onAlternarEncerrada?: (licenca: Licenca) => void;
  /** Excluir é `SUPERVISOR` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (licenca: Licenca) => void;
  /** `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu certo. */
  onDevolver: (checkoutId: string, checkinAt: string) => Promise<boolean>;
  /** Troca só a chave de uma entrega aberta, por outra da lista. Resolve `true` quando deu certo. */
  onTrocarChave: (checkoutId: string, licenseKeyId: string) => Promise<boolean>;
  /** A busca de "Com quem está" já preenchida — o link da ficha traz o nome de quem está com ela. */
  buscaInicial?: string;
  /** Chegou por um link: abre em "Com quem está", que é onde a devolução acontece. */
  veioDoLink?: boolean;
}

export default function LicencaDetalheModal({
  licenca, ocupado, onClose, onEntregar, onEditar, onAlternarEncerrada, onExcluir, onDevolver, onTrocarChave,
  buscaInicial = '', veioDoLink = false,
}: LicencaDetalheModalProps) {
  // A linha da listagem desenha o cabeçalho no primeiro quadro; a consulta
  // abaixo traz as contagens frescas logo em seguida.
  const { data: detalhe, error: erroDoDetalhe } = useLicenseQuery(licenca.id);

  const [paginaDasEntregas, setPaginaDasEntregas] = useState(1);
  const [busca, setBusca] = useState(buscaInicial);
  const buscaAdiada = useDebouncedValue(busca);
  const entregas = useLicenseCheckoutsQuery(licenca.id, {
    page: paginaDasEntregas, perPage: POR_PAGINA, q: buscaAdiada || undefined,
  });

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const historico = useLicenseHistoryQuery(licenca.id, { page: paginaDoHistorico, perPage: POR_PAGINA });

  const atual = detalhe ?? licenca;
  const encerrada = atual.status === 'ENCERRADA';
  const motivoSemEntrega = motivoParaNaoEntregar(atual);

  const mudarBusca = (valor: string) => {
    setBusca(valor);
    setPaginaDasEntregas(1);
  };

  // A página que deixou de existir volta para a última — a entrega voltou, aqui
  // ou por outra pessoa —, senão a lista abre vazia dizendo que ninguém está
  // com a licença. Ajuste DURANTE o render, guardado pela condição, como na lista.
  const ultimaPaginaDasEntregas = entregas.data
    ? Math.max(1, Math.ceil(entregas.data.total / POR_PAGINA))
    : paginaDasEntregas;
  if (paginaDasEntregas > ultimaPaginaDasEntregas) setPaginaDasEntregas(ultimaPaginaDasEntregas);

  const totalDoHistorico = historico.data?.total ?? 0;

  const dados = (
    <>
      {erroDoDetalhe && <Aviso>Não foi possível atualizar a licença: {erroDoDetalhe.message}</Aviso>}
      <GradeDeDados>
        {/* As chaves só chegam com o detalhe: a linha da listagem não as traz.
            O `key` pela chave: trocar de licença pelo link com a janela aberta
            não leva o "Mostrar" ligado para a chave da outra. */}
        <Dado rotulo="Chaves do produto" largo>
          {!detalhe ? (erroDoDetalhe ? 'Não foi possível carregar' : 'Carregando…')
            : detalhe.keys.length > 0 && (
              <ol className="space-y-1.5">
                {detalhe.keys.map((chave, indice) => (
                  <li key={chave.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-text-tertiary">{indice + 1}.</span>
                    <ChaveEscondida chave={chave.productKey} />
                    <span className="text-xs text-text-tertiary">{lugarDaChave(chave)}</span>
                  </li>
                ))}
              </ol>
            )}
        </Dado>
        <Dado rotulo="Vencimento">
          {atual.expirationDate && (
            <>
              {formatarData(atual.expirationDate)}
              {!encerrada && <span className="text-text-tertiary"> · {textoDoPrazo(atual.diasParaVencer)}</span>}
            </>
          )}
        </Dado>
        <Dado rotulo="Encerramento">{formatarData(atual.terminationDate)}</Dado>
        <Dado rotulo="Categoria">{atual.category?.name}</Dado>
        <Dado rotulo="Fabricante">{atual.manufacturer?.name}</Dado>
        <Dado rotulo="Licenciado para">{atual.licensedToName}</Dado>
        <Dado rotulo="E-mail do licenciado">{atual.licensedToEmail}</Dado>
        <Dado rotulo="Número do pedido">{atual.orderNumber}</Dado>
        <Dado rotulo="Data da compra">{formatarData(atual.purchaseDate)}</Dado>
        {/* Ausente para quem não vê o custo (D77, AV): o campo some, e não diz "sem valor". */}
        <Dado rotulo="Valor da compra">{textoDoValorDaCompra(atual)}</Dado>
        <Dado rotulo="Notas" largo>{atual.notes}</Dado>
      </GradeDeDados>
    </>
  );

  const comQuemEsta = (
    <>
      <ListToolbar
        search={busca}
        onSearchChange={mudarBusca}
        placeholder="Buscar por colaborador ou computador…"
        page={paginaDasEntregas}
        perPage={POR_PAGINA}
        total={entregas.data?.total ?? 0}
        onPageChange={setPaginaDasEntregas}
      />
      <EntregasAbertas
        carregando={entregas.isPending}
        erro={entregas.error?.message ?? null}
        entregas={entregas.data?.rows ?? []}
        chaves={detalhe?.keys ?? []}
        vazio={buscaAdiada ? `Ninguém com "${buscaAdiada}" está com esta licença.` : undefined}
        ocupado={ocupado}
        onDevolver={onDevolver}
        onTrocarChave={onTrocarChave}
      />
    </>
  );

  const historicoDaLicenca = (
    <>
      {/* O paginador só quando há mais de uma página: com três eventos,
          "1–3 de 3" é ruído. */}
      {totalDoHistorico > POR_PAGINA && (
        <ListToolbar
          page={paginaDoHistorico}
          perPage={POR_PAGINA}
          total={totalDoHistorico}
          onPageChange={setPaginaDoHistorico}
        />
      )}
      <HistoricoLicenca eventos={historico.data?.rows ?? []} carregando={historico.isPending} erro={historico.error?.message ?? null} />
    </>
  );

  return (
    <JanelaDeDetalhe
      titulo={atual.name}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          <PontoDeStatus tom={TOM_DO_STATUS[atual.status]}>{ROTULO_DO_STATUS[atual.status]}</PontoDeStatus>
          {resumoDaContagem(atual)}
        </span>
      }
      // As ações da lista, com as mesmas regras: a encerrada não entrega, e se
      // reabre pelo mesmo botão.
      acoes={
        <>
          {!encerrada && (
            <Button
              size="sm"
              onClick={() => onEntregar(atual)}
              disabled={motivoSemEntrega !== null}
              title={motivoSemEntrega ?? undefined}
            >
              <UserPlus /> Entregar
            </Button>
          )}
          {onEditar && (
            <Button variant="outline" size="sm" onClick={() => onEditar(atual)}><Pencil /> Editar</Button>
          )}
          <AcoesDaLinha
            nome={atual.name}
            acoes={[
              onAlternarEncerrada && {
                rotulo: encerrada ? 'Reabrir' : 'Encerrar',
                icone: encerrada ? Power : PowerOff,
                onClick: () => onAlternarEncerrada(atual),
                disabled: ocupado,
              },
              onExcluir && {
                rotulo: 'Excluir',
                icone: Trash2,
                onClick: () => onExcluir(atual),
                disabled: ocupado,
                perigo: true,
              },
            ]}
          />
        </>
      }
      abaInicial={veioDoLink ? 'posse' : 'dados'}
      abas={[
        { id: 'dados', rotulo: <><Info /> Detalhes</>, conteudo: dados },
        // `emUso`, e não o total da lista: com a busca do link, ele diria só quantos
        // a busca achou, e não com quantos a licença está.
        { id: 'posse', rotulo: <><Users /> Com quem está <ContagemDaAba>{atual.emUso}</ContagemDaAba></>, conteudo: comQuemEsta },
        { id: 'historico', rotulo: <><History /> Histórico</>, conteudo: historicoDaLicenca },
      ]}
      onClose={onClose}
    />
  );
}
