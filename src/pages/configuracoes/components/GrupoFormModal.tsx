import { useMemo, useState } from 'react';
import { Lock, X } from 'lucide-react';
import type { Grupo, GrupoInput } from '../../../domain/shared/access.types';

interface Props {
  grupo: Grupo | null;
  /** O catálogo agrupado por módulo — as caixas que a tela desenha. */
  porModulo: Map<string, { chave: string; rotulo: string }[]>;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (data: GrupoInput) => Promise<void>;
}

/**
 * O formulário de um grupo: nome, descrição e as caixas de permissão.
 *
 * AS CAIXAS SAEM DO CATÁLOGO DO SERVIDOR, nunca de uma lista escrita aqui — é o
 * `GET /api/permissions`. Uma lista no painel ficaria velha na primeira chave
 * acrescentada, e o sintoma seria uma permissão que o sistema reconhece e a tela
 * não oferece: ninguém erraria, ninguém saberia.
 */
export default function GrupoFormModal({ grupo, porModulo, salvando, onFechar, onSalvar }: Props) {
  const [name, setName] = useState(grupo?.name ?? '');
  const [description, setDescription] = useState(grupo?.description ?? '');
  const [erro, setErro] = useState<string | null>(null);

  // SÓ AS CHAVES COM `true`: a coluna nunca grava `false` (o D76 não tem
  // `deny`), mas ler defensivamente aqui custa nada e impede que um valor vindo
  // de fora da tela apareça marcado.
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(Object.entries(grupo?.permissions ?? {}).filter(([, v]) => v).map(([k]) => k)),
  );

  // Grupo de sistema: as permissões são do CÓDIGO e o seed as repõe, então a API
  // recusa alterá-las (409). A tela mostra as caixas DESABILITADAS em vez de
  // esconder — ver o que o grupo concede é útil; o que não se pode é mudar.
  const travado = grupo?.isSystem ?? false;

  const modulos = useMemo(() => [...porModulo.entries()], [porModulo]);

  function alternar(chave: string) {
    setMarcadas((anterior) => {
      const proximo = new Set(anterior);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function alternarModulo(chaves: { chave: string }[], marcar: boolean) {
    setMarcadas((anterior) => {
      const proximo = new Set(anterior);
      for (const { chave } of chaves) {
        if (marcar) proximo.add(chave);
        else proximo.delete(chave);
      }
      return proximo;
    });
  }

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    try {
      await onSalvar({
        name: name.trim(),
        description: description.trim() || null,
        // Array, e não objeto com `true`: o servidor converte. Mandar o objeto
        // daqui abriria a porta para `false`, que é uma segunda forma de dizer
        // "não concedido" (D76).
        permissions: [...marcadas],
      });
    } catch (falha) {
      // A frase do servidor é o que importa: ela nomeia a chave desconhecida
      // (422) ou explica o grupo de sistema (409).
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <form
        onSubmit={submeter}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col border border-border-sutil bg-surface-card"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-sutil px-6 py-4">
          <h3 className="font-mono text-sm uppercase tracking-widest text-text-primary">
            {grupo ? 'Editar grupo' : 'Novo grupo'}
          </h3>
          <button type="button" onClick={onFechar} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {travado && (
            <div className="mb-4 flex items-start gap-2 border border-status-warning/40 bg-status-warning/10 p-3 font-mono text-xs text-status-warning">
              <Lock size={14} className="mt-0.5 shrink-0" />
              <span>
                Grupo de sistema: as permissões vêm do código e são repostas a cada seed.
                Para dar menos acesso a alguém, tire a pessoa deste grupo ou crie um grupo próprio.
              </span>
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
                Nome
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={travado}
                required
                maxLength={80}
                className="w-full border border-border-sutil bg-bg-base p-2 text-text-primary transition-colors focus:border-text-secondary focus:outline-none disabled:opacity-50"
                placeholder="Ex: Suporte"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
                Descrição
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={240}
                className="w-full border border-border-sutil bg-bg-base p-2 text-text-primary transition-colors focus:border-text-secondary focus:outline-none"
                placeholder="Para que serve este grupo"
              />
            </label>
          </div>

          <div className="mb-3 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
              Permissões
            </span>
            <span className="font-mono text-[10px] text-text-tertiary">
              {marcadas.size} marcada(s)
            </span>
          </div>

          <div className="space-y-4">
            {modulos.map(([modulo, chaves]) => {
              const todasMarcadas = chaves.every(({ chave }) => marcadas.has(chave));
              return (
                <div key={modulo} className="border border-border-sutil">
                  <div className="flex items-center justify-between border-b border-border-sutil bg-bg-base px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                      {modulo}
                    </span>
                    {/* "Marcar o módulo" existe porque o caso real é por módulo:
                        "o Suporte mexe em ativo" quer dizer as cinco chaves de
                        ativo. Marcar cinco caixas uma a uma convida ao
                        esquecimento de uma. */}
                    {!travado && (
                      <button
                        type="button"
                        onClick={() => alternarModulo(chaves, !todasMarcadas)}
                        className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary"
                      >
                        {todasMarcadas ? 'Desmarcar' : 'Marcar tudo'}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-2">
                    {chaves.map(({ chave, rotulo }) => (
                      <label key={chave} className="flex cursor-pointer items-start gap-2 py-1">
                        <input
                          type="checkbox"
                          checked={marcadas.has(chave)}
                          onChange={() => alternar(chave)}
                          disabled={travado}
                          className="mt-0.5 accent-status-success"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs text-text-primary">{rotulo}</span>
                          {/* A CHAVE CRUA FICA VISÍVEL, em cinza. É ela que
                              aparece na mensagem do 403 ("falta assets.viewCost"),
                              e quem for atender esse chamado precisa achar a
                              caixa certa sem adivinhar qual frase corresponde. */}
                          <span className="block font-mono text-[10px] text-text-tertiary">{chave}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {erro && (
            <p className="mt-4 border border-status-danger/40 bg-status-danger/10 p-3 font-mono text-xs text-status-danger">
              {erro}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border-sutil px-6 py-4">
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-tertiary transition-colors hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || !name.trim()}
            className="bg-text-primary px-4 py-2 font-mono text-xs uppercase tracking-widest text-bg-base transition-colors hover:bg-text-secondary disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
