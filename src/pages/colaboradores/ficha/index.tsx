import {
  History, KeyRound, MapPin, Monitor, Package,
} from 'lucide-react';
import HistoryPanel from './components/HistoryPanel';
import { useColaborador } from './hooks/useColaborador';
import CartaoDaFicha, { FichaIndisponivel } from '../../../components/CartaoDaFicha';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import SituacaoDaEntrega from '../../../components/SituacaoDaEntrega';
import TabelaDaFicha from '../../../components/TabelaDaFicha';
import { Avatar } from '../../../components/ui/avatar';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Dado } from '../../../components/ui/dado';
import {
  ContagemDaAba, Tabs, TabsContent, TabsList, TabsTrigger,
} from '../../../components/ui/tabs';
import { formatarData, formatarDiaDoInstante } from '../../../helpers/format.helper';
import { caminhoDoItem, textoDeUnidades } from '../../../helpers/estoque.helper';
import { caminhoDaLicenca, prazoDaEntrega } from '../../../helpers/licenca.helper';
import { useAbaNaUrl } from '../../../hooks/useAbaNaUrl';
import { rotuloDaVolta, useVoltaComFiltros } from '../../../hooks/useVoltaComFiltros';

// FICHA DO COLABORADOR — quem é a pessoa, os COMPUTADORES entregues a ela, os
// POSTOS que ela ocupa, o estoque e as licenças no nome dela, e o HISTÓRICO
// (docs/referencia/modelo-de-posse.md). Abre da página Colaboradores. São as
// quatro coisas que a desativação e a exclusão cobram, cada uma com o link
// para onde ela se devolve ou se encerra.
//
// Os postos aparecem inclusive quando não têm ativo nenhum entregue: é uma
// ocupação aberta, e é ela que a desativação cobra.
//
// Quem é a pessoa fica no card de cima; embaixo, uma aba para cada coisa que está com
// ela e, por último, o histórico: as abas dizem o que ESTÁ, o histórico diz o que FOI.
// Um ativo devolvido mês passado não aparece nas de cima, e é ele que responde "já teve
// um notebook antes?". Cada linha abre o registro, onde mora o Devolver ou o Encerrar.

const ABAS = ['computadores', 'postos', 'estoque', 'licencas', 'historico'] as const;
const DESDE = { rotulo: 'Desde', className: 'w-32' };

export default function ColaboradorPage() {
  const {
    pessoa, ocupacoes, totalDeOcupacoes, carregandoOcupacoes, erroDasOcupacoes, carregando, erro,
    historico, totalDoHistorico, paginaDoHistorico, setPaginaDoHistorico, carregandoHistorico, erroDoHistorico,
  } = useColaborador();
  const voltar = useVoltaComFiltros('/colaboradores');
  const [aba, setAba] = useAbaNaUrl(ABAS);
  const rotulo = rotuloDaVolta(voltar.para, 'Colaboradores');

  if (carregando || erro || !pessoa) {
    return <FichaIndisponivel lista="Colaboradores" rotuloDaVolta={rotulo} voltar={voltar} carregando={carregando} erro={erro ?? 'Colaborador não encontrado.'} />;
  }

  const unidades = pessoa.itens.reduce((soma, entrega) => soma + entrega.unidades, 0);

  return (
    <div className="space-y-4 pb-6 motion-safe:animate-fade-in">
      <PaginaCabecalho titulo={pessoa.name} voltar={{ ...voltar, rotulo }} />

      <div className="space-y-6">
        <CartaoDaFicha marca={<Avatar nome={pessoa.name} className="size-10 text-sm" />}>
          {/* Estar desativado é a primeira coisa que a tela precisa dizer: todo número
              embaixo tem que ser lido como histórico. Quando e por quem foi desativado
              fica na auditoria, no banco (AB). */}
          <Dado rotulo="Situação">
            <PontoDeStatus tom={pessoa.isActive ? 'sucesso' : 'aviso'}>{pessoa.isActive ? 'Ativo' : 'Desativado'}</PontoDeStatus>
          </Dado>
          <Dado rotulo="E-mail">{pessoa.email}</Dado>
          {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
          <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(pessoa.createdAt)}</Dado>
          <Dado rotulo="Notas" largo>{pessoa.notes}</Dado>
        </CartaoDaFicha>

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="computadores"><Monitor /> Computadores <ContagemDaAba>{pessoa.ativos.length}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="postos"><MapPin /> Postos <ContagemDaAba>{totalDeOcupacoes}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="estoque"><Package /> Estoque <ContagemDaAba>{unidades}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="licencas"><KeyRound /> Licenças <ContagemDaAba>{pessoa.licencas.length}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="historico"><History /> Histórico <ContagemDaAba>{totalDoHistorico}</ContagemDaAba></TabsTrigger>
          </TabsList>

          {/* Só os entregues a ELA: o computador do posto que ocupa fica na ficha do posto. */}
          <TabsContent value="computadores">
            <TabelaDaFicha
              colunas={[{ rotulo: 'Computador' }, { rotulo: 'Modelo', className: 'w-[24%]' }, { rotulo: 'Devolução prevista', className: 'w-48' }, DESDE]}
              icone={Monitor}
              vazio="Não é responsável por nenhum computador."
              linhas={pessoa.ativos.map((posse) => ({
                id: posse.id,
                para: `/computadores/${posse.asset.id}`,
                nome: (
                  <>
                    <span className="font-mono">{posse.asset.assetTag}</span>
                    {posse.asset.name && ` · ${posse.asset.name}`}
                  </>
                ),
                nota: posse.checkoutNotes,
                celulas: [posse.asset.model.name, formatarData(posse.expectedCheckinAt), formatarDiaDoInstante(posse.checkoutAt)],
              }))}
            />
          </TabsContent>

          {/* Inclusive os postos sem ativo nenhum: ocupar também é responder por ele. */}
          <TabsContent value="postos">
            <TabelaDaFicha
              colunas={[{ rotulo: 'Posto' }, { rotulo: 'Turno', className: 'w-64' }, DESDE]}
              icone={MapPin}
              carregando={carregandoOcupacoes}
              erro={erroDasOcupacoes}
              vazio="Não é responsável por nenhum posto."
              linhas={ocupacoes.map((ocupacao) => ({
                id: ocupacao.id,
                para: ocupacao.workstation ? `/postos/${ocupacao.workstation.id}` : undefined,
                nome: ocupacao.workstation?.name ?? '—',
                celulas: [ocupacao.shift || '—', formatarDiaDoInstante(ocupacao.startedAt)],
              }))}
            />
          </TabsContent>

          {/* As unidades no NOME dela, nunca as do posto que ocupa. */}
          <TabsContent value="estoque">
            <TabelaDaFicha
              colunas={[{ rotulo: 'Item' }, { rotulo: 'Categoria', className: 'w-[24%]' }, { rotulo: 'Quantidade', className: 'w-40' }, DESDE]}
              icone={Package}
              vazio="Não é responsável por nenhum item de estoque."
              linhas={pessoa.itens.map((entrega) => ({
                id: entrega.id,
                para: caminhoDoItem(entrega.item.id, pessoa.name),
                nome: entrega.item.name,
                nota: entrega.notes,
                celulas: [entrega.item.category.name, textoDeUnidades(entrega.unidades), formatarDiaDoInstante(entrega.checkoutAt)],
              }))}
            />
          </TabsContent>

          {/* As entregues a ELA, nunca as do computador que ela usa. */}
          <TabsContent value="licencas">
            <TabelaDaFicha
              colunas={[{ rotulo: 'Licença' }, { rotulo: 'Categoria', className: 'w-[24%]' }, { rotulo: 'Vencimento', className: 'w-44' }, { rotulo: 'Situação', className: 'w-36' }, DESDE]}
              icone={KeyRound}
              vazio="Não é responsável por nenhuma licença."
              linhas={pessoa.licencas.map((entrega) => ({
                id: entrega.id,
                para: caminhoDaLicenca(entrega.license.id, pessoa.name),
                nome: entrega.license.name,
                nota: entrega.checkoutNotes,
                celulas: [entrega.license.category?.name ?? '—', prazoDaEntrega(entrega), <SituacaoDaEntrega status={entrega.status} />, formatarDiaDoInstante(entrega.checkoutAt)],
              }))}
            />
          </TabsContent>

          <TabsContent value="historico">
            <HistoryPanel
              eventos={historico}
              pagina={{ page: paginaDoHistorico, total: totalDoHistorico ?? 0, onPageChange: setPaginaDoHistorico }}
              carregando={carregandoHistorico}
              erro={erroDoHistorico}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
