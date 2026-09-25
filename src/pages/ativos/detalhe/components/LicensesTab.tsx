import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LicencaDoAtivo } from '../../../../domain/shared/license.types';
import { momentoDoEvento } from '../../../helpers/historico.helper';

// A ABA LICENÇAS — "o que está licenciado NESTA máquina".
//
// Nasceu desabilitada na F2, dizendo "chega na Fase 6"; é esta a Fase 6. A
// moldura da tela não mudou: sumiu o `fase` da lista de abas, entrou o conteúdo.
//
// SÓ AS OCUPAÇÕES ABERTAS: a pergunta é de ESTADO. Os assentos que já foram
// devolvidos estão na trilha da LICENÇA, não na do ativo.
//
// ─────────────────────────────────────────────────────────────────────────────
// NÃO HÁ BOTÃO DE DEVOLVER AQUI, e a ausência é deliberada.
//
// Devolver pode QUEIMAR o assento, e a confirmação que explica isso precisa do
// número de assentos que vão restar — que é dado da LICENÇA, não do ativo. Um
// botão aqui teria que buscar aquele contexto para dizer a mesma frase, ou
// diria menos; o link leva para onde a operação já está inteira.
// ─────────────────────────────────────────────────────────────────────────────

interface LicensesTabProps {
  licencas: LicencaDoAtivo[];
  carregando: boolean;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function LicensesTab({ licencas, carregando }: LicensesTabProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando licenças…</p>;

  if (licencas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3">
        <KeyRound size={24} className="opacity-50" />
        <span>Nenhuma licença atribuída a este ativo.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          O assento de uma{' '}
          <Link to="/licencas" className="text-status-success hover:underline">licença</Link>{' '}
          vai para uma pessoa OU para uma máquina. Se o software é licenciado por dispositivo,
          é a este ativo que o assento se entrega — e se for por usuário nomeado, cada pessoa
          que usa esta máquina precisa do seu.
        </span>
      </div>
    );
  }

  return (
    <div className="border border-border-sutil bg-surface-card overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border-sutil bg-bg-base/40">
          <tr>
            <th className={CABECALHO}>Licença</th>
            <th className={CABECALHO}>Fabricante</th>
            <th className={CABECALHO}>Assento</th>
            <th className={CABECALHO}>Desde</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((item) => (
            <tr key={item.id} className="border-b border-border-sutil/50 last:border-0">
              <td className="px-3 py-2">
                <Link to="/licencas" className="text-text-primary hover:text-status-success transition-colors">
                  {item.seat.license.name}
                </Link>
                {!item.seat.license.reassignable && (
                  // O aviso aparece aqui porque é aqui que alguém decide
                  // descomissionar a máquina — e devolver o assento no caminho
                  // destrói valor.
                  <span className="ml-2 text-[10px] text-status-warning">não reatribuível</span>
                )}
              </td>
              <td className="px-3 py-2 text-text-secondary">
                {item.seat.license.manufacturer?.name ?? item.seat.license.category?.name ?? '—'}
              </td>
              <td className="px-3 py-2 text-text-secondary">
                #{item.seat.seatNumber} de {item.seat.license.seatsTotal}
              </td>
              <td className="px-3 py-2 text-text-tertiary">{momentoDoEvento(item.checkoutAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
