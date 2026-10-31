import { Component, type ErrorInfo, type ReactNode } from 'react';

// O ERRO QUE A PÁGINA NÃO ESPERAVA — um `null` onde ela lia um campo, por
// exemplo.
//
// Sem isto, o React 19 desmonta a árvore INTEIRA quando a renderização lança:
// a tela fica branca, sem menu e sem mensagem, e só recarregar resolve. Em volta
// do conteúdo, e não da aplicação, o menu continua de pé e leva a outra tela.
//
// `chave` é o endereço: trocar de tela limpa o erro, sem o que a mensagem
// seguiria a pessoa por todas as páginas.
//
// Componente de classe porque o React só captura erro de renderização assim
// (`getDerivedStateFromError`); não há hook para isso.

interface ErroDaTelaProps {
  chave: string;
  children: ReactNode;
}

interface ErroDaTelaEstado {
  erro: Error | null;
  chave: string;
}

export default class ErroDaTela extends Component<ErroDaTelaProps, ErroDaTelaEstado> {
  state: ErroDaTelaEstado = { erro: null, chave: this.props.chave };

  static getDerivedStateFromError(erro: Error): Partial<ErroDaTelaEstado> {
    return { erro };
  }

  static getDerivedStateFromProps(props: ErroDaTelaProps, estado: ErroDaTelaEstado): Partial<ErroDaTelaEstado> | null {
    return props.chave === estado.chave ? null : { erro: null, chave: props.chave };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    // O console é o único lugar onde o erro aparece por inteiro: a tela mostra só a frase.
    console.error(erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md text-center leading-relaxed">
        <p className="text-status-danger">Esta tela encontrou um erro e não pôde ser mostrada.</p>
        <p className="mt-2 text-sm text-text-tertiary">
          Recarregue a página. Se continuar, avise o responsável pelo sistema.
        </p>
      </div>
    );
  }
}
