import { Link } from 'react-router-dom';
import { MonitorCheck } from 'lucide-react';
import type { Endpoint } from '../../../domain/shared/endpoint.types';

// AS MÁQUINAS QUE JÁ SÃO PATRIMÔNIO — o outro lado da lista "Sem vínculo".
//
// Existe para a pergunta "esta máquina é qual ativo?" ter resposta sem abrir
// ativo por ativo: a etiqueta está na linha e leva à ficha, onde moram a
// telemetria, o comando e o Desvincular. Só leitura — mexer no vínculo é na
// aba Máquina do ativo, que tem o contexto para isso.

interface Props {
  maquinas: Endpoint[];
  carregando: boolean;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function VinculadasTable({ maquinas, carregando }: Props) {
  if (maquinas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3 border border-border-sutil">
        <MonitorCheck size={24} className="opacity-50" />
        <span>{carregando ? 'Carregando máquinas…' : 'Nenhuma máquina vinculada a um ativo ainda.'}</span>
        {!carregando && (
          <span className="text-[10px] max-w-md text-center leading-relaxed">
            O vínculo nasce aceitando uma sugestão, ou à mão, em "Sem vínculo".
          </span>
        )}
      </div>
    );
  }

  return (
    <table className="w-full border border-border-sutil text-xs font-mono">
      <thead className="bg-bg-base/50 border-b border-border-sutil">
        <tr>
          <th className={CABECALHO}>Máquina</th>
          <th className={CABECALHO}>Ativo</th>
          <th className={CABECALHO}>Sistema</th>
          <th className={CABECALHO}>Agente</th>
          <th className={CABECALHO}>Último contato</th>
        </tr>
      </thead>
      <tbody>
        {maquinas.map((maquina) => (
          <tr key={maquina.id} className="border-b border-border-sutil last:border-0">
            <td className="px-3 py-2 text-text-primary">{maquina.hostname}</td>
            <td className="px-3 py-2">
              {/* `asset` pode faltar só na linha que o `SetNull` desfez entre
                  duas revalidações; o rótulo diz isso em vez de quebrar. */}
              {maquina.asset ? (
                <>
                  <Link to={`/computadores/${maquina.asset.id}`} className="text-status-info hover:underline">
                    {maquina.asset.assetTag}
                  </Link>
                  {maquina.asset.name && <span className="text-text-tertiary"> — {maquina.asset.name}</span>}
                </>
              ) : (
                <span className="text-text-tertiary">vínculo desfeito</span>
              )}
            </td>
            <td className="px-3 py-2 text-text-secondary">{maquina.osVersion}</td>
            <td className={`px-3 py-2 ${maquina.status === 'ONLINE' ? 'text-status-success' : 'text-text-tertiary'}`}>
              {maquina.status}
            </td>
            <td className="px-3 py-2 text-text-tertiary">
              {new Date(maquina.lastSeen).toLocaleString('pt-BR')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
