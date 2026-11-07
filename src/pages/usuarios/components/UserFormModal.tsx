import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import FormularioLateral from '../../../components/FormularioLateral';
import { Button } from '../../../components/ui/button';
import { Campo } from '../../../components/ui/campo';
import { Input } from '../../../components/ui/input';
import { Seletor } from '../../../components/ui/seletor';
import type { Cargo, User } from '../../../types/user.types';
import type { UserInput } from '../../../queries/user.queries';
import { CARGOS_NA_TELA } from '../../../helpers/cargo.helper';
import type { PedidoDeConfirmacao } from '../../../hooks/useConfirmacao';
import { useCopiar } from '../../../hooks/useCopiar';

// O FORMULÁRIO DE USUÁRIO — quem opera o sistema: nome, e-mail e cargo.
//
// O CARGO (AV) é campo do formulário (D162), e a conta nova começa em Técnico, o
// de menor acesso. Tirar o último Administrador o servidor recusa
// (`ultimo-administrador.ts`), e a frase dele aparece aqui.
//
// SEM CAMPO DE SENHA (AU): quem cadastra não escolhe a senha de outra pessoa. A
// conta nasce com uma temporária, que aparece aqui uma vez, e a pessoa escolhe
// a dela ao entrar. A de quem esqueceu é o botão Gerar senha temporária.
//
// Quem só RECEBE equipamento não é usuário: é colaborador, cadastrado na página
// Colaboradores.

const PERGUNTA_COM_A_SENHA_NA_TELA: PedidoDeConfirmacao = {
  titulo: 'Fechar sem guardar a senha?',
  descricao: 'Ela aparece só agora: feche e ela não volta.',
  acao: 'Fechar',
  voltar: 'Continuar aqui',
  perigo: true,
};

interface UserFormModalProps {
  user?: User | null;
  /** A senha que o `⋯` da linha gerou: o formulário abre mostrando. */
  senhaGerada?: string | null;
  onClose: () => void;
  /** Devolve a senha temporária no cadastro (AU); `null` na edição, que fecha a janela. */
  onSubmit: (data: UserInput) => Promise<string | null>;
  /**
   * Gera a senha temporária desta conta (AR) e a devolve; `null` se a pessoa
   * desistiu na confirmação. Ausente no cadastro, na PRÓPRIA conta, onde a sua senha se
   * troca em Minha conta, e na conta desativada, que não entra.
   */
  onGerarSenhaTemporaria?: () => Promise<string | null>;
}

export default function UserFormModal({ user, senhaGerada = null, onClose, onSubmit, onGerarSenhaTemporaria }: UserFormModalProps) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    role: (user?.role ?? 'TECNICO') as Cargo,
  });
  const alcance = CARGOS_NA_TELA.find((cargo) => cargo.valor === formData.role)?.alcance;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // A senha temporária gerada, mostrada UMA vez: o servidor só guarda o hash.
  const [temporaria, setTemporaria] = useState<string | null>(senhaGerada);
  const { copiado, copiar } = useCopiar(temporaria ?? '', 'Não foi possível copiar a senha. Selecione e copie à mão.');
  // A senha está na tela: a da conta nova ou a temporária que acabou de valer. Os campos
  // travam e o que resta é Fechar: salvar de novo criaria outra conta, e na edição o
  // Salvar fechava o painel sem perguntar, levando a senha junto.
  const senhaNaTela = temporaria !== null;

  const gerarTemporaria = async () => {
    if (!onGerarSenhaTemporaria) return;
    setError('');
    try {
      const senha = await onGerarSenhaTemporaria();
      if (!senha) return;
      // O que estava digitado e não foi salvo volta ao que está gravado: com os campos
      // travados, ele pareceria salvo.
      if (user) setFormData({ name: user.name, email: user.email, role: user.role });
      setTemporaria(senha);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const senha = await onSubmit({
        name: formData.name,
        email: formData.email,
        role: formData.role,
        // `isActive` NÃO viaja daqui: desativar e ativar são o botão da linha,
        // em Ações (`useUsers.handleAlternarAtivo`), o mesmo padrão das outras
        // listas. Quem nasce, nasce ativo — o `strictObject` do create recusa o
        // campo.
      });
      if (senha) setTemporaria(senha);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormularioLateral
      titulo={user ? 'Editar usuário' : 'Novo usuário'}
      descricao={user?.name}
      onClose={onClose}
      onSubmit={handleSubmit}
      erro={error}
      salvando={loading}
      perguntaAoSair={temporaria ? PERGUNTA_COM_A_SENHA_NA_TELA : undefined}
      // Um Cancelar diria que dá para desfazer a conta criada ou a senha gerada.
      rodape={senhaNaTela ? <Button onClick={onClose}>Fechar</Button> : undefined}
    >
      <Campo rotulo="Nome completo" obrigatorio>
        <Input required disabled={senhaNaTela} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
      </Campo>

      <Campo rotulo="E-mail" obrigatorio>
        <Input required disabled={senhaNaTela} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
      </Campo>

      <Campo rotulo="Cargo" obrigatorio ajuda={alcance}>
        <Seletor
          obrigatorio
          disabled={senhaNaTela}
          value={formData.role}
          onChange={(valor) => setFormData({ ...formData, role: valor as Cargo })}
          vazio="Selecione…"
          placeholderDaBusca="Buscar cargo…"
          opcoes={CARGOS_NA_TELA.map((cargo) => ({ value: cargo.valor, label: cargo.nome }))}
        />
      </Campo>

      {(onGerarSenhaTemporaria || temporaria) && (
        <div className="border-t border-border-sutil pt-4">
          {temporaria ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-text-primary">Senha temporária</p>
              <div className="flex items-center gap-2">
                <code className="flex h-10 min-w-0 flex-1 select-all items-center overflow-x-auto rounded-md border border-border-sutil bg-bg-base px-3 font-mono text-sm text-text-primary">{temporaria}</code>
                <Button variant="outline" onClick={() => void copiar()}>
                  <Copy /> {copiado ? 'Copiada' : 'Copiar'}
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-text-secondary">
                Aparece só agora: feche e ela não volta. Entregue à pessoa; ela escolhe a própria senha no primeiro acesso.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Button variant="outline" onClick={() => void gerarTemporaria()}>
                <KeyRound /> Gerar senha temporária
              </Button>
              <p className="text-sm leading-relaxed text-text-secondary">
                Para quem esqueceu a senha: a de hoje deixa de valer e a pessoa escolhe outra ao entrar.
              </p>
            </div>
          )}
        </div>
      )}
    </FormularioLateral>
  );
}
