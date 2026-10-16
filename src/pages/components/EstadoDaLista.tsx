// O QUE A ÁREA DA TABELA DIZ QUANDO NÃO HÁ LINHA — e por que são três frases,
// não uma.
//
// Lista vazia tem três causas que pedem coisas diferentes de quem olha:
//
//   carregando — a resposta ainda não chegou. Esperar.
//   erro       — a resposta chegou e é uma recusa (500, rede, 403). Ler o motivo.
//   vazio      — a resposta chegou e não tem nada. Cadastrar, mudar a busca.
//
// Antes as três desenhavam o terceiro caso: a primeira carga piscava "Nenhum
// registro… Cadastrar" por um instante, e um servidor fora do ar dizia ao
// técnico que o inventário estava vazio — com um botão de cadastrar o primeiro
// item embaixo. É a mentira mais perigosa que uma lista pode contar, porque
// convida a recadastrar o que existe.
//
// Só a MENSAGEM: o ícone e a moldura continuam de quem desenha a tabela, porque
// cada tela tem os seus. Quem usa passa o vazio de sempre como `children`.

interface EstadoDaListaProps {
  /** Primeira carga — `isPending` da query, que com `placeholderData` só vale uma vez. */
  carregando: boolean;
  /** A mensagem do erro da consulta, já traduzida pelo `apiClient`. `null` sem erro. */
  erro: string | null;
  children: React.ReactNode;
}

export default function EstadoDaLista({ carregando, erro, children }: EstadoDaListaProps) {
  if (carregando) return <span>Carregando…</span>;
  if (erro) {
    return (
      <span role="alert" className="text-status-danger max-w-md text-center leading-relaxed">
        Não foi possível carregar a lista: {erro}
      </span>
    );
  }
  return <>{children}</>;
}
