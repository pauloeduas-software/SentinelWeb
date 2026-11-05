import { Pencil, Power, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import AcoesDaLinha from '../AcoesDaLinha';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { nomeDaRelacao, rotuloDoEnum } from '../../helpers/format.helper';
import type { AcaoLinhaId, AcaoLinhaSpec, ColunaSpec } from './catalog-ui.types';
import type { CatalogRow } from '../../types/catalog.types';

// A LINHA INTEIRA CLICA (AY): abre a ficha, onde a spec declara uma, e o Editar
// nas outras. O `⋯` guarda Editar, Desativar/Ativar e Excluir, nessa ordem.

/** A linha está com o campo da ação de alternar desligado? (`false`, não ausente.) */
function desligada(registro: CatalogRow, acoes?: readonly AcaoLinhaSpec[]): AcaoLinhaSpec | undefined {
  return acoes?.find((acao) => acao.alterna && registro[acao.alterna.campo] === false);
}

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
   * A LIXEIRA está na tela: a linha oferece só Restaurar. Editar, desativar e
   * excluir um registro que está na lixeira não existem — o servidor responde
   * 404 —, então o botão nem aparece.
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
            {colunas.map((coluna) => <TableHead key={coluna.key}>{coluna.label}</TableHead>)}
            <TableHead className="w-12 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {registros.map((registro) => {
            const apagada = desligada(registro, acoes);
            const comFicha = acoes?.some((acao) => acao.id === 'ficha');
            const nome = String(registro.name ?? '');
            // Na lixeira não há o que abrir: o servidor responde 404, e a linha só restaura.
            const abrir = onRestore
              ? undefined
              : () => (comFicha ? onAcao?.('ficha', registro) : onEdit(registro));

            return (
              <TableRow
                key={registro.id}
                onClick={abrir}
                className={[abrir ? 'cursor-pointer' : '', apagada ? 'opacity-60' : ''].join(' ')}
              >
                {colunas.map((coluna, indice) => (
                  <TableCell key={coluna.key}>
                    {indice === 0 ? (
                      // O botão é o caminho do teclado: o clique sobe para a linha.
                      <button type="button" className="text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                        <Celula coluna={coluna} registro={registro} />
                      </button>
                    ) : (
                      <Celula coluna={coluna} registro={registro} />
                    )}
                    {/* A marca vai na PRIMEIRA coluna, ao lado do nome: é onde o
                        olho está ao procurar a linha. */}
                    {indice === 0 && apagada?.alterna && (
                      <Badge tom="aviso" className="ml-2">{apagada.alterna.marcaSeDesligado}</Badge>
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {onRestore ? (
                    <Button variant="ghost" size="sm" onClick={() => onRestore(registro)} aria-label={`Restaurar ${nome}`}>
                      <RotateCcw /> Restaurar
                    </Button>
                  ) : (
                    <AcoesDaLinha
                      nome={nome}
                      acoes={[
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
                  )}
                </TableCell>
              </TableRow>
            );
          })}

          {registros.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colunas.length + 1} className="py-16 text-center text-text-tertiary">
                {vazio}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function Celula({ coluna, registro }: { coluna: ColunaSpec; registro: CatalogRow }) {
  const valor = registro[coluna.key];

  switch (coluna.render) {
    case 'enum':
      return <span>{rotuloDoEnum(valor, coluna.opcoes)}</span>;

    case 'relacao':
      return <span>{nomeDaRelacao(valor)}</span>;

    default:
      return <span>{valor == null || valor === '' ? '—' : String(valor)}</span>;
  }
}
