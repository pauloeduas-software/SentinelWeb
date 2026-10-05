import { Lock, TriangleAlert } from 'lucide-react';
import {
  MASCARA_DE_CAMPO, type CampoDoConjunto, type ConjuntoResolvido,
} from '../../../domain/shared/custom-field.types';

// O FORMULÁRIO DINÂMICO — um `<input>` por campo que o conjunto do modelo pede.
//
// ═════════════════════════════════════════════════════════════════════════════
// ELE DESENHA PELO `element` E VALIDA NO SERVIDOR.
//
// Nenhuma validação de formato acontece aqui, de propósito. O motor mora em
// `server/domain/custom-field/helpers/field-validator.helper.ts`, e reescrevê-lo
// em TypeScript criaria duas definições do que é um IP válido — que divergiriam
// no primeiro ajuste, com a do cliente vencendo por chegar primeiro e a do
// servidor recusando depois, sem ninguém entender por quê.
//
// O que a tela faz é o que só ela pode fazer: `type="date"` abre calendário,
// `<select>` mostra a lista fechada, `inputMode="decimal"` abre o teclado
// numérico no celular. O 422 do servidor volta com o `slug` em `fields`, e é por
// ele que a mensagem é pintada no campo certo.
// ═════════════════════════════════════════════════════════════════════════════

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

export interface CustomFieldsSectionProps {
  conjunto: ConjuntoResolvido | undefined;
  /** `slug` → valor, como o formulário o carrega. */
  valores: Record<string, string>;
  /** `slug` → mensagem, vindo do `fields` do 422. */
  erros?: Record<string, string>;
  /**
   * Chaves gravadas que NÃO estão no conjunto atual (D60).
   *
   * Elas não são editáveis aqui — o conjunto mudou e a tela não sabe o formato
   * delas —, e são CONTADAS num aviso. Apagá-las seria a "limpeza" que ninguém
   * pede: o conjunto antigo pode voltar.
   */
  orfaos?: string[];
  onChange: (slug: string, valor: string) => void;
}

export default function CustomFieldsSection({
  conjunto, valores, erros = {}, orfaos = [], onChange,
}: CustomFieldsSectionProps) {
  // Modelo sem conjunto nenhum: a seção não aparece. Um cabeçalho "Campos
  // customizados" seguido de nada é pior que a ausência — sugere que algo não
  // carregou.
  if (!conjunto || conjunto.campos.length === 0) {
    return orfaos.length > 0 ? <AvisoDeOrfaos quantos={orfaos.length} /> : null;
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-text-tertiary uppercase tracking-widest text-[10px] border-b border-border-sutil w-full pb-2 mb-3 flex items-center justify-between gap-2">
        <span>{conjunto.fieldsetName ?? 'Campos customizados'}</span>
        {/* DE ONDE os campos vieram. Sem isto, um campo que aparece sozinho ao
            trocar o modelo parece defeito — e a diferença entre "todo notebook
            pede isto" e "só este modelo pede" muda o que o operador faz. */}
        <span className="normal-case tracking-normal text-[9px] text-text-tertiary/70">
          {conjunto.origem === 'MODEL' ? 'definido no modelo' : 'definido na categoria'}
        </span>
      </legend>

      <div className="grid grid-cols-2 gap-4">
        {conjunto.campos.map((campo) => (
          <div
            key={campo.slug}
            className={`space-y-1 ${
              campo.element === 'TEXTAREA' || campo.element === 'RADIO' ? 'col-span-2' : ''
            }`}
          >
            <label className={`${ROTULO} flex items-center gap-1.5`}>
              {campo.name}{campo.required && '*'}
              {campo.encrypted && (
                // O `title` vai no `<span>` e não no ícone: os ícones do
                // lucide-react não repassam atributos de acessibilidade.
                //
                // E o cadeado sem explicação é enfeite. O que ele precisa dizer é
                // o que muda para quem preenche: o valor não volta na tela.
                <span
                  className="text-status-warning inline-flex"
                  title="Cifrado em repouso: depois de salvo, o valor só aparece pela ação de revelar — que fica registrada."
                >
                  <Lock size={10} />
                </span>
              )}
            </label>

            <Campo
              campo={campo}
              valor={valores[campo.slug] ?? ''}
              onChange={(valor) => onChange(campo.slug, valor)}
            />

            {erros[campo.slug] && (
              <p className="text-status-danger text-[10px] leading-relaxed">{erros[campo.slug]}</p>
            )}
            {!erros[campo.slug] && campo.helpText && (
              <p className="text-text-tertiary text-[10px] leading-relaxed">{campo.helpText}</p>
            )}
            {/* O valor GRAVADO que saiu da lista não é apagado nem escondido — ele
                é marcado. Apagá-lo seria o D60 outra vez, e escondê-lo faria a
                tela mentir sobre o que está no banco. */}
            {foraDaLista(campo, valores[campo.slug]) && (
              <p className="text-status-warning text-[10px] leading-relaxed flex items-start gap-1">
                <TriangleAlert size={11} className="shrink-0 mt-0.5" />
                Este valor não está mais na lista do campo. Ele continua gravado; escolher outro o substitui.
              </p>
            )}
          </div>
        ))}
      </div>

      {orfaos.length > 0 && <AvisoDeOrfaos quantos={orfaos.length} />}
    </fieldset>
  );
}

/**
 * O valor gravado saiu da lista do campo?
 *
 * Cálculo fora do JSX (docs/referencia/arquitetura.md) — e ele é a razão de o `<select>`
 * abaixo injetar a opção extra: sem ela, o `<select>` não teria como exibir o
 * valor atual e cairia na primeira opção, trocando o dado do cliente por um
 * default no primeiro render.
 */
function foraDaLista(campo: CampoDoConjunto, valor: string | undefined): boolean {
  if (campo.element !== 'LISTBOX' && campo.element !== 'RADIO') return false;
  if (!valor) return false;
  return !campo.listValues.includes(valor);
}

function AvisoDeOrfaos({ quantos }: { quantos: number }) {
  return (
    <p className="col-span-2 p-3 border border-border-sutil bg-bg-base/50 text-text-tertiary text-[10px] leading-relaxed flex items-start gap-2">
      <TriangleAlert size={12} className="shrink-0 mt-0.5 text-status-warning" />
      <span>
        Este ativo tem {quantos} {quantos === 1 ? 'valor' : 'valores'} de um conjunto de campos
        anterior. {quantos === 1 ? 'Ele continua' : 'Eles continuam'} gravado
        {quantos === 1 ? '' : 's'} e não {quantos === 1 ? 'é' : 'são'} editável
        {quantos === 1 ? '' : 'is'} aqui — voltar o modelo anterior {quantos === 1 ? 'o' : 'os'} traz
        de volta ao formulário. Ver a aba Detalhes.
      </span>
    </p>
  );
}

function Campo({
  campo, valor, onChange,
}: {
  campo: CampoDoConjunto;
  valor: string;
  onChange: (valor: string) => void;
}) {
  // ── O CAMPO CIFRADO, e o sentinela de ida e volta ─────────────────────────
  //
  // A leitura devolve `••••••`, e é ISSO que fica no input. Reenviado, o servidor
  // o lê como "não mexi neste campo" — então uma edição de outro campo não
  // destrói o segredo, e digitar por cima o substitui.
  //
  // `type="password"` e não `text`: o que está ali é a máscara, mas o que a pessoa
  // DIGITA é o segredo novo, e ele não deve ficar legível na tela de quem está
  // com alguém por cima do ombro.
  if (campo.encrypted) {
    const naoTocado = valor === MASCARA_DE_CAMPO;
    return (
      <>
        <input
          type="password"
          autoComplete="new-password"
          value={valor}
          onChange={(event) => onChange(event.target.value)}
          placeholder={naoTocado ? undefined : 'digite para definir'}
          className={CLASSE_CAMPO}
        />
        {naoTocado && (
          <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
            Já tem valor guardado. Digitar aqui o substitui; deixar como está o mantém.
          </p>
        )}
      </>
    );
  }

  if (campo.element === 'CHECKBOX') {
    // O valor viaja como TEXTO `"true"`/`"false"` — é o que o servidor guarda,
    // para o filtro `?cf[slug]=true` funcionar igual a qualquer outro campo.
    return (
      <label className="flex items-center gap-3 cursor-pointer text-text-secondary h-9">
        <input
          type="checkbox"
          checked={valor === 'true'}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          className="accent-status-success w-4 h-4"
        />
        <span className="uppercase tracking-widest text-[10px]">
          {valor === 'true' ? 'sim' : 'não'}
        </span>
      </label>
    );
  }

  if (campo.element === 'LISTBOX') {
    return (
      <select
        required={campo.required}
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        className={CLASSE_CAMPO}
      >
        {/* A opção vazia existe mesmo no campo obrigatório: sem ela, abrir o
            formulário de um ativo sem valor escolheria a primeira opção sem
            ninguém clicar — e gravaria um dado que ninguém escolheu. O `required`
            é que barra o envio vazio. */}
        <option value="">—</option>
        {/* O valor GRAVADO que saiu da lista entra como opção extra, senão o
            `<select>` não teria como exibi-lo e cairia na primeira opção,
            trocando o dado do cliente por um default no primeiro render. */}
        {foraDaLista(campo, valor) && <option value={valor}>{valor} (fora da lista)</option>}
        {campo.listValues.map((opcao) => (
          <option key={opcao} value={opcao}>{opcao}</option>
        ))}
      </select>
    );
  }

  if (campo.element === 'RADIO') {
    return (
      <div className="flex flex-wrap gap-4 py-1">
        {campo.listValues.map((opcao) => (
          <label key={opcao} className="flex items-center gap-2 cursor-pointer text-text-secondary">
            <input
              type="radio"
              name={campo.slug}
              checked={valor === opcao}
              onChange={() => onChange(opcao)}
              className="accent-status-success w-4 h-4"
            />
            <span className="text-[11px]">{opcao}</span>
          </label>
        ))}
        {foraDaLista(campo, valor) && (
          <label className="flex items-center gap-2 text-text-tertiary">
            <input type="radio" name={campo.slug} checked readOnly className="accent-status-warning w-4 h-4" />
            <span className="text-[11px]">{valor} (fora da lista)</span>
          </label>
        )}
      </div>
    );
  }

  if (campo.element === 'TEXTAREA') {
    return (
      <textarea
        required={campo.required}
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        className={`${CLASSE_CAMPO} h-20 resize-none`}
      />
    );
  }

  if (campo.element === 'DATE') {
    return (
      <input
        type="date"
        required={campo.required}
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        className={CLASSE_CAMPO}
      />
    );
  }

  // TEXT — e o `inputMode` sai do FORMATO, não do elemento: é ele que sabe que o
  // campo recebe número, e é o que abre o teclado certo no celular.
  return (
    <input
      type="text"
      required={campo.required}
      inputMode={campo.format === 'NUMERIC' ? 'decimal' : undefined}
      value={valor}
      onChange={(event) => onChange(event.target.value)}
      placeholder={exemploDoFormato(campo.format)}
      className={CLASSE_CAMPO}
    />
  );
}

/**
 * Um EXEMPLO do formato, como placeholder.
 *
 * Exemplo e não descrição ("use um IPv4"): o exemplo responde a mesma pergunta
 * em menos espaço e não repete a mensagem de erro, que é quem explica o que deu
 * errado quando dá.
 */
function exemploDoFormato(format: CampoDoConjunto['format']): string | undefined {
  switch (format) {
    case 'IPV4': return 'Ex: 10.0.0.7';
    case 'IPV6': return 'Ex: 2001:db8::1';
    case 'IP': return 'Ex: 10.0.0.7';
    case 'MAC': return 'Ex: 00:1B:44:11:3A:B7';
    case 'EMAIL': return 'Ex: nome@empresa.com';
    case 'URL': return 'Ex: https://...';
    case 'NUMERIC': return 'Ex: 1234';
    case 'DATE': return 'AAAA-MM-DD';
    default: return undefined;
  }
}
