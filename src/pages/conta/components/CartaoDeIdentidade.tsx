import { Avatar } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { nomeDoCargo } from '../../../helpers/cargo.helper';
import { useAuthStore } from '../../../stores/auth.store';

// QUEM É O DONO DA CONTA, com o nome da sessão: o que está salvo, e não o que está
// sendo digitado ao lado. O fundo atrás do avatar segura o tom transparente dele,
// que senão mostraria a divisa entre a faixa e o cartão. Ele estica com a coluna ao
// lado, e `lg:mb-18` desconta a linha do botão (SecaoDaConta): assim termina no mesmo
// pixel do cartão da aba.
export default function CartaoDeIdentidade() {
  const usuario = useAuthStore((estado) => estado.usuario);
  if (!usuario) return null;

  return (
    <Card className="flex flex-col overflow-hidden border-t-4 border-t-primary text-center shadow-md lg:mb-18">
      <div className="relative h-32 bg-gradient-to-br from-primary/5 to-primary/10">
        <span className="absolute -bottom-14 left-1/2 flex -translate-x-1/2 rounded-full bg-surface-card">
          <Avatar
            nome={usuario.name}
            className="size-32 border-4 border-surface-card bg-primary/10 text-4xl font-normal text-primary shadow-lg"
          />
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-8 pt-20">
        <div className="w-full">
          <h3 className="truncate text-2xl font-bold text-text-primary" title={usuario.name}>{usuario.name}</h3>
          <p className="truncate text-base text-text-tertiary" title={usuario.email}>{usuario.email}</p>
        </div>
        <Badge className="px-3 py-1 text-sm">{nomeDoCargo(usuario.role)}</Badge>
      </div>
    </Card>
  );
}
