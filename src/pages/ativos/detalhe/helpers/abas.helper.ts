import { Cpu, History, Info, KeyRound, MonitorSmartphone, Paperclip, Users, Wrench } from 'lucide-react';

// AS OITO ABAS DA TELA DE DETALHE — dado, não componente.
//
// Fica em `helpers/` porque é a lista que a tela percorre, e porque um arquivo
// que exporta componente E constante quebra o fast refresh do Vite (o lint
// reprova). O componente que as desenha é `components/AssetTabs.tsx`.
//
// TODAS NASCEM, e as que ainda não existem aparecem
// DESABILITADAS dizendo em que fase chegam. Não é enfeite: aba ausente e aba
// vazia são indistinguíveis de defeito para quem usa o sistema — "cadê os
// componentes deste notebook?" não tem resposta se a aba não estiver lá. Com a
// fase escrita, a pergunta se responde sozinha e a moldura da tela não muda
// quando a fase chegar: some o `fase`, entra o conteúdo.

export type AbaId =
  | 'detalhes' | 'posse' | 'historico'
  | 'componentes' | 'licencas' | 'maquina' | 'manutencoes' | 'arquivos';

export interface Aba {
  id: AbaId;
  rotulo: string;
  icone: typeof Info;
  /** `null` = já existe. Preenchido = ainda não, e diz quando. */
  fase: string | null;
}

export const ABAS: readonly Aba[] = [
  { id: 'detalhes', rotulo: 'Detalhes', icone: Info, fase: null },
  { id: 'posse', rotulo: 'Posse', icone: Users, fase: null },
  { id: 'historico', rotulo: 'Histórico', icone: History, fase: null },
  // Saiu de desabilitada na F5: sumiu o `fase`, entrou o conteúdo — a
  // moldura da tela não mudou, que era o que a decisão prometia.
  { id: 'componentes', rotulo: 'Componentes', icone: Cpu, fase: null },
  // Saiu de desabilitada na F6: sumiu o `fase`, entrou o conteúdo — a moldura
  // da tela não mudou, que era o que a decisão prometia.
  { id: 'licencas', rotulo: 'Licenças', icone: KeyRound, fase: null },
  // NASCEU JÁ PRONTA na F7 — é a única das abas que não passou por
  // desabilitada, porque o que ela mostra não existia em fase nenhuma: até a
  // convergência, o ativo não sabia que tinha uma máquina.
  { id: 'maquina', rotulo: 'Máquina', icone: MonitorSmartphone, fase: null },
  // Saiu de desabilitada na F8: sumiu o `fase`, entrou o conteúdo — a moldura da
  // tela não mudou, que era o que a decisão prometia. Ela mostra DUAS listas:
  // serviço e conferência (ver `MaintenanceTab`).
  { id: 'manutencoes', rotulo: 'Manutenções', icone: Wrench, fase: null },
  // Entrou na Leva 2 do fechamento da F2 (docs/historico/fase-02-ativos.md) — era a
  // Etapa G dela, adiada quando `@fastify/multipart` foi instalado e não usado.
  { id: 'arquivos', rotulo: 'Arquivos', icone: Paperclip, fase: null },
];
