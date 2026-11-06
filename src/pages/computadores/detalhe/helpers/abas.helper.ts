import { Cpu, History, Info, KeyRound, Monitor, Users } from 'lucide-react';

// AS SEIS ABAS DA TELA DE DETALHE — dado, não componente.
//
// Fica em `helpers/` porque é a lista que a tela percorre, e porque um arquivo
// que exporta componente E constante quebra o fast refresh do Vite (o lint
// reprova). O componente que as desenha é `components/AssetTabs.tsx`.
//
// Toda aba desta lista existe e tem conteúdo. Aba que não tivesse não entraria
// aqui: aba vazia é indistinguível de defeito para quem usa o sistema.

export type AbaId =
  | 'detalhes' | 'posse' | 'historico'
  | 'licencas' | 'componentes' | 'maquina';

export interface Aba {
  id: AbaId;
  rotulo: string;
  icone: typeof Info;
}

export const ABAS: readonly Aba[] = [
  { id: 'detalhes', rotulo: 'Detalhes', icone: Info },
  { id: 'posse', rotulo: 'Posse', icone: Users },
  { id: 'licencas', rotulo: 'Licenças', icone: KeyRound },
  { id: 'componentes', rotulo: 'Componentes', icone: Cpu },
  { id: 'maquina', rotulo: 'Máquina', icone: Monitor },
  { id: 'historico', rotulo: 'Histórico', icone: History },
];

export const IDS_DAS_ABAS: readonly AbaId[] = ABAS.map((aba) => aba.id);
