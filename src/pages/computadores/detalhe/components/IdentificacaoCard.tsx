import { Monitor, PackageX, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { Dado, GradeDeDados } from '../../../../components/ui/dado';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { Asset } from '../../../../types/asset.types';
import { seloDaSaida } from '../../helpers/baixa.helper';
import { resumoDaPosse, tomDoStatus } from '../../helpers/posse.helper';

// O CARD DE IDENTIFICAÇÃO: o que responde "que máquina é esta, de quem é e onde
// está" antes de qualquer aba. O que é do catálogo e da compra fica em Detalhes.

export default function IdentificacaoCard({ asset }: { asset: Asset }) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const selo = seloDaSaida(asset);
  const posse = resumoDaPosse(asset.posse);

  return (
    <Card className="flex gap-4 p-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Monitor className="size-5" />
      </span>

      <GradeDeDados className="min-w-0 flex-1 md:grid-cols-4 xl:grid-cols-6">
        <Dado rotulo="Status">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tom={tomDoStatus(asset.status.type)}>{asset.status.name}</Badge>
            {selo && <Badge tom="aviso"><PackageX className="size-3 shrink-0" /> {selo}</Badge>}
          </span>
        </Dado>
        <Dado rotulo="Número de série">
          {asset.serial && <span className="font-mono">{asset.serial}</span>}
        </Dado>
        <Dado rotulo="Nome / apelido">{asset.name}</Dado>
        <Dado rotulo="Responsável">
          {posse.postoVago
            ? <Badge tom="aviso"><TriangleAlert className="size-3 shrink-0" /> Posto vago</Badge>
            : posse.responsaveis}
        </Dado>
        {/* NUM POSTO, o computador está onde o posto fica (AW), e a
            localização dele é para onde volta na devolução — a atual e a
            padrão do Snipe-IT. Fora de posto, é onde ele está guardado. */}
        {asset.postoAtual ? (
          <>
            <Dado rotulo="Localização">
              {asset.postoAtual.location.name} ·{' '}
              <Link to={`/postos/${asset.postoAtual.id}`} className="text-primary hover:underline">
                {asset.postoAtual.name}
              </Link>
            </Dado>
            <Dado rotulo="Volta para">{asset.location?.name}</Dado>
          </>
        ) : (
          <Dado rotulo="Localização">{asset.location?.name}</Dado>
        )}
        {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
        <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(asset.createdAt)}</Dado>
      </GradeDeDados>
    </Card>
  );
}
