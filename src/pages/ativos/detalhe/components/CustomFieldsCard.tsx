import { Eye, Lock, TriangleAlert } from 'lucide-react';
import { MASCARA_DE_CAMPO, type ConjuntoResolvido } from '../../../../domain/shared/custom-field.types';

// OS CAMPOS CUSTOMIZADOS NA FICHA DO ATIVO — só leitura, com uma exceção.
//
// ═════════════════════════════════════════════════════════════════════════════
// A EXCEÇÃO É O BOTÃO DE REVELAR, E ELE NÃO É UMA LEITURA COMUM.
//
// Toda leitura do ativo devolve `••••••` no lugar de um valor cifrado. O botão
// chama a ÚNICA rota que devolve o texto em claro — e ela GRAVA `ActivityLog` a
// cada chamada, porque *quem viu este segredo* é o fato auditável: depois de
// revelado, o valor não pode ser "des-revelado" (D62).
//
// Por isso o valor revelado não é guardado nem em cache nem no estado da página:
// ele aparece, e fechar ou recarregar a tela o leva embora. Quem precisar de novo
// clica de novo, e o clique fica registrado — que é exatamente o comportamento
// que a auditoria espera.
// ═════════════════════════════════════════════════════════════════════════════
//
// AS CHAVES ÓRFÃS (D60) APARECEM AQUI, e é a única tela que as mostra: o
// formulário não as edita (o conjunto mudou e ele não sabe o formato delas), mas
// esconder da FICHA um valor que está no banco faria a tela mentir sobre o que
// existe.

interface CustomFieldsCardProps {
  /**
   * O que a leitura do ativo devolveu, já mascarado.
   *
   * `null` quando o ativo não tem campo nenhum; `undefined` quando a resposta não
   * carrega a coluna — ela não está no select compartilhado do servidor, e o tipo
   * `Asset` diz isso com a interrogação. Os dois caem no mesmo lugar aqui.
   */
  valores: Record<string, string> | null | undefined;
  /** O conjunto do modelo, para os rótulos e a ordem. Ausente enquanto carrega. */
  conjunto: ConjuntoResolvido | undefined;
  /** `slug` → valor revelado nesta sessão de tela. Nunca persistido. */
  revelados: Record<string, string>;
  revelando: string | null;
  erroAoRevelar: string;
  onRevelar: (slug: string) => void;
}

export default function CustomFieldsCard({
  valores, conjunto, revelados, revelando, erroAoRevelar, onRevelar,
}: CustomFieldsCardProps) {
  const gravados = valores ?? {};
  const doConjunto = conjunto?.campos ?? [];

  // Cálculo fora do JSX (docs/ARQUITETURA.md). Órfão é chave gravada que o
  // conjunto atual não tem — e enquanto o conjunto não chegou, nada é órfão:
  // considerar tudo órfão por um quadro faria a ficha piscar uma lista de
  // "valores de conjunto anterior" que não existe.
  const slugsDoConjunto = new Set(doConjunto.map((campo) => campo.slug));
  const orfaos = conjunto ? Object.keys(gravados).filter((slug) => !slugsDoConjunto.has(slug)) : [];

  // Nem campo no conjunto nem valor gravado: a seção não aparece. Um cabeçalho
  // seguido de nada sugere que algo não carregou.
  if (doConjunto.length === 0 && orfaos.length === 0) return null;

  return (
    <section className="space-y-3 md:col-span-2">
      <h3 className="text-text-tertiary uppercase tracking-widest text-[10px] border-b border-border-sutil pb-2 flex items-center justify-between gap-2">
        <span>{conjunto?.fieldsetName ?? 'Campos customizados'}</span>
        {conjunto?.origem && (
          <span className="normal-case tracking-normal text-[9px] text-text-tertiary/70">
            {conjunto.origem === 'MODEL' ? 'definido no modelo' : 'definido na categoria'}
          </span>
        )}
      </h3>

      {erroAoRevelar && (
        <p className="text-status-danger text-[10px] leading-relaxed">{erroAoRevelar}</p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {doConjunto.map((campo) => {
          const valor = gravados[campo.slug];
          const revelado = revelados[campo.slug];
          const cifradoComValor = campo.encrypted && valor === MASCARA_DE_CAMPO;

          return (
            <div key={campo.slug} className="space-y-1">
              <div className="text-text-tertiary uppercase tracking-widest text-[10px] flex items-center gap-1.5">
                {campo.name}
                {campo.encrypted && (
                  <span className="text-status-warning inline-flex" title="Cifrado em repouso">
                    <Lock size={10} />
                  </span>
                )}
              </div>

              <div className="text-text-primary break-words flex items-center gap-2">
                {/* O valor revelado VENCE a máscara, e some quando a tela sai. */}
                <span className={revelado ? 'text-status-warning' : undefined}>
                  {revelado ?? formatarValor(campo.element, valor)}
                </span>

                {cifradoComValor && !revelado && (
                  <button
                    type="button"
                    disabled={revelando === campo.slug}
                    onClick={() => onRevelar(campo.slug)}
                    title="Revelar — a ação fica registrada no histórico do ativo"
                    className="text-text-tertiary hover:text-status-warning transition-colors disabled:opacity-40 shrink-0"
                  >
                    <Eye size={13} />
                  </button>
                )}
              </div>

              {valorForaDaLista(campo.listValues, campo.element, valor) && (
                <p className="text-status-warning text-[10px] leading-relaxed">
                  fora da lista atual do campo
                </p>
              )}
            </div>
          );
        })}
      </div>

      {orfaos.length > 0 && (
        <div className="space-y-2 border-t border-border-sutil pt-3">
          <p className="text-text-tertiary text-[10px] leading-relaxed flex items-start gap-2">
            <TriangleAlert size={12} className="shrink-0 mt-0.5 text-status-warning" />
            <span>
              Abaixo, {orfaos.length === 1 ? 'o valor' : 'os valores'} de um conjunto de campos
              ANTERIOR — o modelo deste ativo mudou e {orfaos.length === 1 ? 'esta chave' : 'estas chaves'}{' '}
              não {orfaos.length === 1 ? 'faz' : 'fazem'} parte do conjunto atual.{' '}
              {orfaos.length === 1 ? 'Ela continua' : 'Elas continuam'} gravada
              {orfaos.length === 1 ? '' : 's'} de propósito: voltar o modelo anterior{' '}
              {orfaos.length === 1 ? 'a' : 'as'} traz de volta ao formulário.
            </span>
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {orfaos.map((slug) => (
              <div key={slug} className="space-y-1 opacity-70">
                {/* O SLUG como rótulo, e não um nome: o campo pode nem existir
                    mais no cadastro, e inventar um rótulo bonito para uma chave
                    órfã esconderia que ela é órfã. */}
                <div className="text-text-tertiary uppercase tracking-widest text-[10px]">{slug}</div>
                <div className="text-text-secondary break-words">
                  {gravados[slug] === MASCARA_DE_CAMPO ? '•••••• (cifrado)' : gravados[slug]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** `"true"`/`"false"` viram palavra; vazio vira travessão. */
function formatarValor(element: string, valor: string | undefined): string {
  if (valor === undefined || valor === '') return '—';
  if (element === 'CHECKBOX') return valor === 'true' ? 'sim' : 'não';
  return valor;
}

function valorForaDaLista(
  listValues: string[],
  element: string,
  valor: string | undefined,
): boolean {
  if (element !== 'LISTBOX' && element !== 'RADIO') return false;
  if (!valor) return false;
  return !listValues.includes(valor);
}
