import { Link } from 'react-router-dom';
import ComputadoresNaFicha from '../../../../components/ComputadoresNaFicha';
import { Aviso } from '../../../../components/ui/aviso';
import type { AtivoDoPosto } from '../../../../types/workstation.types';

// O COMPUTADOR DA MESA: o ativo entregue ao posto. Esta aba diz o que está aqui, e
// a do lado, a Máquina, como ele está agora (BX). A tabela é a mesma da aba
// Computadores do colaborador (CE).
//
// SEM DEVOLVER (BN): a linha abre a ficha do computador, onde ele mora.

interface ComputadorTabProps {
  ativos: readonly AtivoDoPosto[];
}

export default function ComputadorTab({ ativos }: ComputadorTabProps) {
  return (
    <>
      {/* Estado que a invariante 19 recusa nas duas portas, e que só um dado de
          antes da regra traria. Se aparecer, precisa ser visto — não escondido
          atrás do primeiro ativo. */}
      {ativos.length > 1 && (
        <Aviso tom="aviso">
          Este posto tem {ativos.length} ativos, e um posto de trabalho tem no máximo um.
          Devolva, na ficha de cada um, os que não ficam nesta mesa. A aba Máquina é a do
          primeiro com máquina; a telemetria de cada um está na ficha dele.
        </Aviso>
      )}

      <ComputadoresNaFicha
        computadores={ativos.map((ativo) => ({
          id: ativo.id, ativo, devolucaoPrevista: ativo.devolucaoPrevista, entregueEm: ativo.entregueEm,
        }))}
        vazio="Nenhum ativo entregue a este posto."
      >
        <span className="max-w-md text-xs leading-relaxed">
          A entrega é feita em{' '}
          <Link to="/computadores" className="text-link hover:underline">Computadores</Link>
          , escolhendo este posto como destino.
        </span>
      </ComputadoresNaFicha>
    </>
  );
}
