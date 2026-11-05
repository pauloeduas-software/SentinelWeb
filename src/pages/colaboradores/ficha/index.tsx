import type { ReactNode } from 'react';
import { ArrowLeft, History, KeyRound, Mail, MapPin, Monitor, Package } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import HistoryPanel from './components/HistoryPanel';
import { useColaborador } from './hooks/useColaborador';
import { Avatar } from '../../../components/ui/avatar';
import { Aviso } from '../../../components/ui/aviso';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { formatarData, formatarDiaDoInstante } from '../../../helpers/format.helper';
import { caminhoDoItem, textoDeUnidades } from '../../../helpers/estoque.helper';
import { caminhoDaLicenca, textoDaSituacao } from '../../../helpers/licenca.helper';

// FICHA DO COLABORADOR — quem é a pessoa, os COMPUTADORES entregues a ela, os
// POSTOS que ela ocupa, o estoque e as licenças no nome dela, e o HISTÓRICO
// (docs/referencia/modelo-de-posse.md). Abre da página Colaboradores. São as
// quatro coisas que a desativação e a exclusão cobram, cada uma com o link
// para onde ela se devolve ou se encerra.
//
// Os postos aparecem inclusive quando não têm ativo nenhum entregue: é uma
// ocupação aberta, e é ela que a desativação cobra.
//
// Quem é a pessoa fica no card à esquerda; à direita, uma aba para cada coisa
// que está com ela e, por último, o histórico: as abas dizem o que ESTÁ, o
// histórico diz o que FOI. Um ativo devolvido mês passado não aparece nas de
// cima, e é ele que responde "já teve um notebook antes?". Cada linha abre o
// registro, onde mora o Devolver ou o Encerrar.

/** Volta para a lista de Colaboradores. */
const VOLTAR = '/colaboradores';

interface LinhaDaFicha {
  id: string;
  para?: string;
  /** O nome na primeira coluna, e a nota embaixo dele. */
  nome: string;
  nota?: string | null;
  celulas: readonly ReactNode[];
}

/** A tabela de uma aba: a linha inteira abre o registro. */
function TabelaDaFicha({ colunas, linhas, vazio }: { colunas: readonly string[]; linhas: readonly LinhaDaFicha[]; vazio: string }) {
  const navigate = useNavigate();

  if (linhas.length === 0) {
    return <Card className="py-16 text-center text-sm text-text-tertiary">{vazio}</Card>;
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>{colunas.map((coluna) => <TableHead key={coluna}>{coluna}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map(({ id, para, nome, nota, celulas }) => (
            <TableRow
              key={id}
              onClick={para ? () => navigate(para) : undefined}
              className={para ? 'cursor-pointer' : undefined}
            >
              <TableCell>
                {para ? (
                  <Link
                    to={para}
                    onClick={(evento) => evento.stopPropagation()}
                    className="font-medium text-text-primary focus-visible:underline focus-visible:outline-none"
                  >
                    {nome}
                  </Link>
                ) : <span className="font-medium text-text-primary">{nome}</span>}
                {nota && <div className="mt-0.5 text-xs text-text-tertiary">{nota}</div>}
              </TableCell>
              {celulas.map((celula, indice) => <TableCell key={indice}>{celula}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function ColaboradorPage() {
  const {
    pessoa, ocupacoes, carregando, erro,
    historico, totalDoHistorico, carregandoHistorico,
  } = useColaborador();

  if (carregando) {
    return <p className="text-sm text-text-tertiary">Carregando colaborador...</p>;
  }

  if (erro || !pessoa) {
    return (
      <div className="space-y-4 text-sm">
        <Aviso>{erro ?? 'Colaborador não encontrado.'}</Aviso>
        <Link to={VOLTAR} className="flex items-center gap-2 text-text-tertiary hover:text-text-primary">
          <ArrowLeft className="size-4" /> Voltar para a lista
        </Link>
      </div>
    );
  }

  const unidades = pessoa.itens.reduce((soma, entrega) => soma + entrega.unidades, 0);

  return (
    <div className="space-y-4 pb-6 motion-safe:animate-fade-in">
      <Link to={VOLTAR} className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary">
        <ArrowLeft className="size-4" /> Colaboradores
      </Link>

      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="overflow-hidden border-t-4 border-t-primary">
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <Avatar nome={pessoa.name} className="size-20 text-2xl" />
            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-xl font-bold text-text-primary">{pessoa.name}</h2>
              {pessoa.email && (
                <p className="flex items-center justify-center gap-1.5 break-all text-sm text-text-tertiary">
                  <Mail className="size-3.5 shrink-0" /> {pessoa.email}
                </p>
              )}
            </div>
            {/* Estar desativado é a primeira coisa que a tela precisa dizer: todo
                número ao lado tem que ser lido como histórico. Quando e por quem
                foi desativado fica na auditoria, no banco (AB). */}
            <Badge tom={pessoa.isActive ? 'sucesso' : 'aviso'}>{pessoa.isActive ? 'Ativo' : 'Desativado'}</Badge>
          </div>
          {pessoa.notes && (
            <div className="space-y-1 border-t border-border-sutil p-6">
              <p className="text-xs font-medium text-text-tertiary">Notas</p>
              <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">{pessoa.notes}</p>
            </div>
          )}
        </Card>

        <Tabs defaultValue="computadores" className="min-w-0 space-y-4">
          <TabsList>
            <TabsTrigger value="computadores"><Monitor /> Computadores ({pessoa.ativos.length})</TabsTrigger>
            <TabsTrigger value="postos"><MapPin /> Postos ({ocupacoes.length})</TabsTrigger>
            <TabsTrigger value="estoque"><Package /> Estoque ({unidades})</TabsTrigger>
            <TabsTrigger value="licencas"><KeyRound /> Licenças ({pessoa.licencas.length})</TabsTrigger>
            <TabsTrigger value="historico"><History /> Histórico ({totalDoHistorico})</TabsTrigger>
          </TabsList>

          {/* Só os entregues a ELA: o computador do posto que ocupa fica na ficha do posto. */}
          <TabsContent value="computadores">
            <TabelaDaFicha
              colunas={['Computador', 'Modelo', 'Devolução prevista', 'Desde']}
              vazio="Não está com nenhum computador."
              linhas={pessoa.ativos.map((posse) => ({
                id: posse.id,
                para: `/computadores/${posse.asset.id}`,
                nome: posse.asset.name ? `${posse.asset.assetTag} · ${posse.asset.name}` : posse.asset.assetTag,
                nota: posse.checkoutNotes,
                celulas: [posse.asset.model.name, formatarData(posse.expectedCheckinAt), formatarDiaDoInstante(posse.checkoutAt)],
              }))}
            />
          </TabsContent>

          {/* Inclusive os postos sem ativo nenhum: ocupar também é responder por ele. */}
          <TabsContent value="postos">
            <TabelaDaFicha
              colunas={['Posto', 'Turno', 'Desde']}
              vazio="Não ocupa nenhum posto."
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
              colunas={['Item', 'Categoria', 'Quantidade', 'Desde']}
              vazio="Não está com nenhum item de estoque."
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
              colunas={['Licença', 'Categoria', 'Situação', 'Desde']}
              vazio="Não está com nenhuma licença."
              linhas={pessoa.licencas.map((entrega) => ({
                id: entrega.id,
                para: caminhoDaLicenca(entrega.license.id, pessoa.name),
                nome: entrega.license.name,
                nota: entrega.checkoutNotes,
                celulas: [entrega.license.category?.name ?? '—', textoDaSituacao(entrega), formatarDiaDoInstante(entrega.checkoutAt)],
              }))}
            />
          </TabsContent>

          <TabsContent value="historico">
            <HistoryPanel eventos={historico} total={totalDoHistorico} carregando={carregandoHistorico} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
