import { Cpu, History, Info, KeyRound, Paperclip, Users, Wrench } from 'lucide-react';

// AS SETE ABAS DA TELA DE DETALHE — dado, não componente.
//
// Fica em `helpers/` porque é a lista que a tela percorre, e porque um arquivo
// que exporta componente E constante quebra o fast refresh do Vite (o lint
// reprova). O componente que as desenha é `components/AssetTabs.tsx`.
//
// AS SETE NASCEM TODAS, e as quatro que ainda não existem aparecem
// DESABILITADAS dizendo em que fase chegam. Não é enfeite: aba ausente e aba
// vazia são indistinguíveis de defeito para quem usa o sistema — "cadê os
// componentes deste notebook?" não tem resposta se a aba não estiver lá. Com a
// fase escrita, a pergunta se responde sozinha e a moldura da tela não muda
// quando a fase chegar: some o `fase`, entra o conteúdo.

export type AbaId =
  | 'detalhes' | 'posse' | 'historico'
  | 'componentes' | 'licencas' | 'manutencoes' | 'arquivos';

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
  { id: 'componentes', rotulo: 'Componentes', icone: Cpu, fase: 'Fase 5' },
  { id: 'licencas', rotulo: 'Licenças', icone: KeyRound, fase: 'Fase 6' },
  { id: 'manutencoes', rotulo: 'Manutenções', icone: Wrench, fase: 'Fase 8' },
  // Entrou na Leva 2 do docs/FECHAMENTO-F2-F4-PLANO-ITAM.md — era a Etapa G da
  // F2, adiada quando `@fastify/multipart` foi instalado e não usado.
  { id: 'arquivos', rotulo: 'Arquivos', icone: Paperclip, fase: null },
];
