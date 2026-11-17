import { Copy } from 'lucide-react';
import { Button } from './ui/button';
import { Dado } from './ui/dado';
import { formatarMemoriaDaPlaca, lerPlacasDeVideo } from '../helpers/maquina.helper';
import { useCopiar } from '../hooks/useCopiar';
import type { EndpointComTelemetria } from '../types/endpoint.types';

// O QUE A MÁQUINA DIZ DE SI, do handshake (CP, DA): como ela se declara, que no
// computador se confere com o cadastro, e no posto é o único lugar em que aparece.
// Os `Dado` soltos, para a grade de quem usa: a aba Máquina do computador e do
// posto, e o card da ficha da máquina (DF). O UUID fica de fora: só a reconciliação
// o usa. O vazio não aparece (`Dado`).

export default function DadosDaMaquina({ maquina }: { maquina: EndpointComTelemetria }) {
  const { copiado, copiar } = useCopiar(maquina.hwid, 'Não foi possível copiar o HWID. Selecione e copie à mão.');
  const placas = lerPlacasDeVideo(maquina.gpus);

  return (
    <>
      <Dado rotulo="Fabricante">{maquina.manufacturer}</Dado>
      <Dado rotulo="Modelo">{maquina.hardwareModel}</Dado>
      <Dado rotulo="Série">{maquina.biosSerial && <span className="font-mono">{maquina.biosSerial}</span>}</Dado>
      <Dado rotulo="Sistema operacional">{maquina.osVersion}</Dado>
      <Dado rotulo="Processador">{maquina.cpuModel}</Dado>
      <Dado rotulo="Endereço IP">{maquina.localIp && <span className="font-mono">{maquina.localIp}</span>}</Dado>
      <Dado rotulo="Endereço MAC">{maquina.macAddress && <span className="font-mono">{maquina.macAddress}</span>}</Dado>
      <Dado rotulo="Versão do agente">{maquina.agentVersion && <span className="font-mono">{maquina.agentVersion}</span>}</Dado>
      <Dado rotulo={placas.length > 1 ? 'Placas de vídeo' : 'Placa de vídeo'} largo>
        {placas.length > 0 && (
          <span className="flex flex-col gap-1">
            {placas.map((placa, indice) => (
              <span key={`${placa.nome}-${indice}`}>
                {placa.nome}
                {placa.memoria && <span className="text-text-tertiary"> · {formatarMemoriaDaPlaca(placa.memoria)}</span>}
              </span>
            ))}
          </span>
        )}
      </Dado>
      {/* O HWID, com o COPIAR: ele não é nome, é o que se cola num chamado e o
          que se procura no log do agente. */}
      <Dado rotulo="HWID" largo>
        <span className="flex flex-wrap items-center gap-2">
          <code className="break-all font-mono text-text-primary">{maquina.hwid}</code>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void copiar()}>
            <Copy /> {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </span>
      </Dado>
    </>
  );
}
