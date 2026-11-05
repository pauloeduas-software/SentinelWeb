import { Moon, Sun } from 'lucide-react';
import { Segmentado } from './ui/segmentado';
import { useTema, type Tema } from '../hooks/useTema';

const OPCOES: readonly { valor: Tema; rotulo: React.ReactNode }[] = [
  { valor: 'claro', rotulo: <><Sun /> Claro</> },
  { valor: 'escuro', rotulo: <><Moon /> Escuro</> },
];

/** Claro ou escuro: no menu do usuário e no login. */
export default function MenuDoTema({ className }: { className?: string }) {
  const tema = useTema((estado) => estado.tema);
  const escolher = useTema((estado) => estado.escolher);
  return <Segmentado opcoes={OPCOES} valor={tema} onChange={escolher} className={className} />;
}
