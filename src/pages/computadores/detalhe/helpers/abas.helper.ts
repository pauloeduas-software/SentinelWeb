import { History, Info, KeyRound, MonitorSmartphone, Users } from 'lucide-react';

// AS CINCO ABAS DA TELA DE DETALHE — dado, não componente.
//
// Fica em `helpers/` porque é a lista que a tela percorre, e porque um arquivo
// que exporta componente E constante quebra o fast refresh do Vite (o lint
// reprova). O componente que as desenha é `components/AssetTabs.tsx`.
//
// Toda aba desta lista existe e tem conteúdo. Aba que não tivesse não entraria
// aqui: aba vazia é indistinguível de defeito para quem usa o sistema.

export type AbaId =
  | 'detalhes' | 'posse' | 'historico'
  | 'licencas' | 'maquina';

export interface Aba {
  id: AbaId;
  rotulo: string;
  icone: typeof Info;
}

export const ABAS: readonly Aba[] = [
  { id: 'detalhes', rotulo: 'Detalhes', icone: Info },
  { id: 'posse', rotulo: 'Posse', icone: Users },
  { id: 'historico', rotulo: 'Histórico', icone: History },
  { id: 'licencas', rotulo: 'Licenças', icone: KeyRound },
  { id: 'maquina', rotulo: 'Máquina', icone: MonitorSmartphone },
];
