import { Input } from './ui/input';
import { centavosDigitados, dinheiroNoCampo } from '../helpers/format.helper';

interface CampoDeDinheiroProps {
  /** O valor como o servidor recebe — "1234.56" — ou '' quando vazio. */
  valor: string;
  onChange: (valor: string) => void;
}

/**
 * O campo de dinheiro: mostra "R$ 1.234,56" e guarda "1234.56". Os dígitos
 * entram pelos centavos (`centavosDigitados`), e apagar tudo esvazia o campo.
 */
export default function CampoDeDinheiro({ valor, onChange }: CampoDeDinheiroProps) {
  return (
    <Input
      inputMode="numeric"
      value={dinheiroNoCampo(valor)}
      onChange={(e) => onChange(centavosDigitados(e.target.value))}
      placeholder="R$ 0,00"
    />
  );
}
