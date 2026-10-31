import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// O CAMPO DE SENHA COM O OLHO: mostrar e ocultar o que foi digitado.
//
// Errar a senha às cegas custa caro aqui: cinco erros travam a conta por 15
// minutos, e a temporária tem 16 símbolos para copiar de outra tela. Ver o que
// se digitou antes de enviar evita o erro de digitação.
//
// O botão é `type="button"` (não envia o formulário) e fica fora da ordem do
// Tab: quem navega pelo teclado vai de um campo ao próximo sem parar nele.

type CampoDeSenhaProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function CampoDeSenha({ className, ...props }: CampoDeSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visivel ? 'text' : 'password'} className={`${className ?? ''} pr-9`} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisivel((atual) => !atual)}
        aria-label={visivel ? 'Ocultar o que foi digitado' : 'Mostrar o que foi digitado'}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
      >
        {visivel ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
