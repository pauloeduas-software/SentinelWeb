import type { ReactNode } from 'react';
import { ContagemDaAba, Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { ABAS, type AbaId } from '../helpers/abas.helper';

// A barra de abas. A LISTA está em `helpers/abas.helper.ts` — aqui só se desenha.
// Quem chama passa um `TabsContent` por aba em `children`.

interface AssetTabsProps {
  ativa: AbaId;
  onChange: (aba: AbaId) => void;
  contagens: Partial<Record<AbaId, number | undefined>>;
  children: ReactNode;
}

export default function AssetTabs({ ativa, onChange, contagens, children }: AssetTabsProps) {
  return (
    <Tabs value={ativa} onValueChange={(valor) => onChange(valor as AbaId)}>
      <TabsList>
        {ABAS.map((aba) => (
          <TabsTrigger key={aba.id} value={aba.id}>
            <aba.icone /> {aba.rotulo} <ContagemDaAba>{contagens[aba.id]}</ContagemDaAba>
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
