// A validação nativa dos campos (`required`, `type="email"`, `min`, `max`) em
// português. O balão é do navegador e sai no idioma dele — em inglês, num
// Chrome em inglês —, e o sistema é só pt-BR. Um ouvinte no documento inteiro
// troca a frase de todo campo, sem tocar em cada formulário.

import { formatarData } from './format.helper';

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function ehCampo(alvo: EventTarget | null): alvo is Campo {
  return alvo instanceof HTMLInputElement || alvo instanceof HTMLSelectElement || alvo instanceof HTMLTextAreaElement;
}

// O limite como a pessoa lê: o `min`/`max` de um campo de data é 'AAAA-MM-DD', e 100000 é 100.000.
function limite(campo: HTMLInputElement, valor: string): string {
  return campo.type === 'date' ? formatarData(valor) : Number(valor).toLocaleString('pt-BR');
}

export function mensagemDeValidacao(campo: Campo): string {
  const v = campo.validity;
  if (v.valueMissing) return campo instanceof HTMLSelectElement ? 'Escolha uma opção.' : 'Preencha este campo.';
  if (v.badInput) return campo.type === 'number' ? 'Digite um número.' : 'Valor inválido.';
  if (v.typeMismatch) {
    if (campo.type === 'email') return 'Digite um e-mail válido, como nome@empresa.com.';
    return campo.type === 'url' ? 'Digite o endereço completo, como https://empresa.com.' : 'Valor em formato inválido.';
  }
  if (!(campo instanceof HTMLInputElement)) return 'Valor inválido.';
  if (v.rangeUnderflow) {
    return campo.type === 'date'
      ? `A data não pode ser antes de ${limite(campo, campo.min)}.`
      : `O mínimo é ${limite(campo, campo.min)}.`;
  }
  if (v.rangeOverflow) {
    return campo.type === 'date'
      ? `A data não pode ser depois de ${limite(campo, campo.max)}.`
      : `O máximo é ${limite(campo, campo.max)}.`;
  }
  if (v.stepMismatch) return 'Use um número inteiro.';
  if (v.tooShort) return `Use pelo menos ${campo.minLength} caracteres.`;
  if (v.tooLong) return `Use no máximo ${campo.maxLength} caracteres.`;
  if (v.patternMismatch) return campo.title || 'Valor em formato inválido.';
  return 'Valor inválido.';
}

export function validacaoEmPortugues(): void {
  // `invalid` não sobe pela árvore: só a captura enxerga todos os campos.
  document.addEventListener('invalid', (evento) => {
    const campo = evento.target;
    if (!ehCampo(campo)) return;
    campo.setCustomValidity('');
    if (!campo.validity.valid) campo.setCustomValidity(mensagemDeValidacao(campo));
  }, true);

  // A frase própria deixa o campo inválido até alguém limpá-la: a cada mudança
  // ele volta a ser julgado pelo navegador, e o `invalid` acima reescreve.
  const limpar = (evento: Event) => {
    if (ehCampo(evento.target)) evento.target.setCustomValidity('');
  };
  document.addEventListener('input', limpar, true);
  document.addEventListener('change', limpar, true);
}
