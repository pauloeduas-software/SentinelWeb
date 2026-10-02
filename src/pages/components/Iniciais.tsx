// O AVATAR DO COLABORADOR — iniciais geradas, sem upload (F11).
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE INICIAIS E NÃO FOTO, e por que isto não é "a primeira metade" de um
// upload que vem depois.
//
// Foto de perfil num inventário de TI custa o que nenhuma tela aqui paga: um
// `Attachment` por pessoa (ou uma coluna de imagem e o armazenamento que vem com
// ela), uma rota de leitura com permissão, miniaturas, e a pergunta de LGPD sobre
// guardar imagem de pessoa junto do patrimônio. O que a foto resolve — reconhecer
// a linha certa numa lista — as iniciais com cor resolvem.
//
// A COR É DERIVADA DO NOME, então a mesma pessoa é sempre a mesma cor em toda
// tela, sem nada gravado em lugar nenhum. E ela é SÓ decoração: o nome está
// sempre ao lado, porque cor nunca é o único portador de significado — quem não
// distingue as cores continua lendo a lista.
//
// `hsl` com saturação e luminosidade FIXAS, variando só o matiz: é o que faz as
// 360 cores possíveis terem o mesmo peso visual no tema claro e no escuro. Uma
// paleta de cinco cores escolhidas à mão daria colisão em qualquer equipe de dez
// pessoas.
// ═══════════════════════════════════════════════════════════════════════════

import { iniciaisDe, matizDe } from '../helpers/iniciais.helper';

interface Props {
  nome: string;
  /** `pequeno` para linha de tabela e barra lateral; `grande` para cabeçalho de ficha. */
  tamanho?: 'pequeno' | 'grande';
}

export default function Iniciais({ nome, tamanho = 'pequeno' }: Props) {
  const matiz = matizDe(nome);
  const cor = `hsl(${matiz} 45% 55%)`;

  const medida = tamanho === 'grande' ? 'h-12 w-12 text-sm' : 'h-7 w-7 text-[10px]';

  return (
    <span
      // `aria-hidden` porque o nome da pessoa está SEMPRE ao lado, no mesmo
      // bloco: um leitor de tela que anunciasse "MS" antes de "Maria da Silva
      // Souza" só repetiria a informação em forma pior.
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center border font-mono uppercase tracking-widest ${medida}`}
      style={{ color: cor, borderColor: cor, backgroundColor: `hsl(${matiz} 45% 55% / 0.08)` }}
      title={nome}
    >
      {iniciaisDe(nome)}
    </span>
  );
}
