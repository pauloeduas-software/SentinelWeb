import { Pencil, Power, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import AcoesDaLinha from '../AcoesDaLinha';
import PessoaNaLinha from '../PessoaNaLinha';
import { PontoDeStatus } from '../ui/badge';
import { Card } from '../ui/card';
import {
  Table, TableBody, TableCell, TableCellAcoes, TableHead, TableHeadAcoes, TableHeader, TableNome, TableRow, type TipoDeColuna,
} from '../ui/table';
import { nomeDaRelacao, rotuloDoEnum } from '../../helpers/format.helper';
import { tomDoStatus, type TipoDeStatus } from '../../helpers/status.helper';
import type { AcaoLinhaId, AcaoLinhaSpec, ColunaSpec, RenderColuna } from './catalog-ui.types';
import type { CatalogRow } from '../../types/catalog.types';

// A LINHA INTEIRA CLICA (AY): abre a ficha, onde a spec declara uma, e o Editar
// nas outras. O `⋯` guarda Editar, Desativar/Ativar e Excluir, nessa ordem.

/** O tipo da coluna, que dá a largura no cabeçalho e nas células (DH). O texto livre divide o que sobra. */
const TIPO_DO_RENDER: Partial<Record<RenderColuna, TipoDeColuna>> = {
  contagem: 'contagem',
  ativo: 'status',
  status: 'status',
  enum: 'rotulo',
};

interface CatalogTableProps {
  colunas: readonly ColunaSpec[];
  registros: readonly CatalogRow[];
  vazio: React.ReactNode;
  /** Ações por linha da aba, além de editar e excluir (Desativar e Ficha, em Colaboradores). */
  acoes?: readonly AcaoLinhaSpec[];
  onEdit: (registro: CatalogRow) => void;
  /** Excluir é `SUPERVISOR` no servidor. Ausente, o botão some — quem decide é a tela. */
  onDelete?: (registro: CatalogRow) => void;
  onAcao?: (id: AcaoLinhaId, registro: CatalogRow) => void;
  /**
   * A LIXEIRA está na tela: o `⋯` oferece só Restaurar. Editar, desativar e
   * excluir um registro que está na lixeira não existem — o servidor responde
   * 404 —, então o botão nem aparece. A linha ainda abre a ficha, para consulta (CF).
   */
  onRestore?: (registro: CatalogRow) => void;
}

export default function CatalogTable({
  colunas, registros, vazio, acoes, onEdit, onDelete, onAcao, onRestore,
}: CatalogTableProps) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {colunas.map((coluna) => (
              <TableHead key={coluna.key} coluna={coluna.render && TIPO_DO_RENDER[coluna.render]} aparece={coluna.aparece}>{coluna.label}</TableHead>
            ))}
            <TableHeadAcoes />
          </TableRow>
        </TableHeader>

        <TableBody>
          {registros.map((registro) => {
            const comFicha = acoes?.some((acao) => acao.id === 'ficha');
            const nome = String(registro.name ?? '');
            // Na lixeira, a linha abre a ficha só para consulta, onde houver uma (CF, como
            // a BW em Computadores). Sem ficha não há o que abrir: a linha só restaura.
            const abrir = onRestore && !comFicha
              ? undefined
              : () => (comFicha ? onAcao?.('ficha', registro) : onEdit(registro));

            return (
              <TableRow key={registro.id} onClick={abrir} apagada={registro.isActive === false}>
                {colunas.map((coluna, indice) => (
                  <TableCell key={coluna.key} coluna={coluna.render && TIPO_DO_RENDER[coluna.render]} aparece={coluna.aparece}>
                    {/* A `pessoa` já traz o nome dela, ao lado do avatar. */}
                    {indice === 0 && coluna.render !== 'pessoa' ? (
                      <TableNome><Celula coluna={coluna} registro={registro} /></TableNome>
                    ) : (
                      <Celula coluna={coluna} registro={registro} />
                    )}
                  </TableCell>
                ))}
                <TableCellAcoes>
                  <AcoesDaLinha
                    nome={nome}
                    acoes={onRestore
                      ? [{ rotulo: 'Restaurar', icone: RotateCcw, onClick: () => onRestore(registro) }]
                      : [
                        { rotulo: 'Editar', icone: Pencil, onClick: () => onEdit(registro) },
                        // A ficha é o clique na linha: não repete no menu.
                        ...(acoes ?? []).filter((acao) => acao.id !== 'ficha').map((acao) => {
                          const desligado = acao.alterna && registro[acao.alterna.campo] === false;
                          return {
                            rotulo: (desligado ? acao.alterna?.tituloSeDesligado : acao.titulo) ?? '',
                            icone: desligado ? Power : PowerOff,
                            onClick: () => onAcao?.(acao.id, registro),
                          };
                        }),
                        onDelete && {
                          rotulo: 'Excluir',
                          icone: Trash2,
                          onClick: () => onDelete(registro),
                          perigo: true,
                        },
                      ]}
                  />
                </TableCellAcoes>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {registros.length === 0 && vazio}
    </Card>
  );
}

function Celula({ coluna, registro }: { coluna: ColunaSpec; registro: CatalogRow }) {
  const valor = registro[coluna.key];

  switch (coluna.render) {
    case 'enum':
      return <span>{rotuloDoEnum(valor, coluna.opcoes)}</span>;

    case 'status':
      return <PontoDeStatus tom={tomDoStatus(valor as TipoDeStatus)}>{rotuloDoEnum(valor, coluna.opcoes)}</PontoDeStatus>;

    case 'ativo':
      return <PontoDeStatus tom={valor === false ? 'aviso' : 'sucesso'}>{valor === false ? 'Desativado' : 'Ativo'}</PontoDeStatus>;

    case 'relacao':
      return <span>{nomeDaRelacao(valor)}</span>;

    case 'contagem':
      return <span>{Number(valor ?? 0)}</span>;

    case 'pessoa':
      return <PessoaNaLinha nome={String(valor ?? '')} email={coluna.sublinha ? String(registro[coluna.sublinha] ?? '') : undefined} />;

    case 'link':
      if (!valor) return <span>—</span>;
      return (
        // O clique fica no link: subir para a linha abriria o formulário junto.
        <a
          href={String(valor)}
          target="_blank"
          rel="noreferrer"
          title={String(valor)}
          onClick={(evento) => evento.stopPropagation()}
          className="block truncate text-link hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {String(valor).replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      );

    default:
      return <span>{valor == null || valor === '' ? '—' : String(valor)}</span>;
  }
}
