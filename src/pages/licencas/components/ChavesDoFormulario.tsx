import { Plus, X } from 'lucide-react';
import { cobertasPelas, linhaNova, type LinhaDeChave } from '../helpers/licenca.helper';

// AS CHAVES DO PRODUTO NO FORMULÁRIO (AC) — uma embaixo da outra, cada uma com
// quantas licenças ela cobre.
//
// ─────────────────────────────────────────────────────────────────────────────
// A chave individual cobre 1; a de volume, várias. Juntas, não passam da
// quantidade comprada — o "Adicionar" para quando chegam lá, e o servidor
// responde 422 se a conta passar por outro caminho.
//
// A CHAVE JÁ ENTREGUE NÃO SAI DA LISTA (o histórico de quem a usou depende
// dela), e não cobre menos do que as entregas abertas com ela: o ✕ fica
// desabilitado, e o "cobre" não desce além disso. O texto dela pode mudar — é
// a correção de digitação, e vale para as entregas dela.
//
// COLAR UMA LISTA com várias linhas num campo cria uma chave para cada linha:
// ninguém digita cinquenta chaves uma a uma. As novas vão para o FIM da lista,
// que é onde o servidor as grava (depois das que já existem): o número que a
// chave tem aqui é o que ela tem no detalhe e na entrega.
// ─────────────────────────────────────────────────────────────────────────────

interface ChavesDoFormularioProps {
  linhas: LinhaDeChave[];
  /** A quantidade comprada como está no campo; `null` enquanto não é um número. */
  compradas: number | null;
  onChange: (linhas: LinhaDeChave[]) => void;
  classeCampo: string;
}

const BOTAO = 'flex items-center gap-1.5 px-2.5 py-1 border border-border-sutil text-[10px] uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30';

export default function ChavesDoFormulario({ linhas, compradas, onChange, classeCampo }: ChavesDoFormularioProps) {
  const cobertas = cobertasPelas(linhas);
  const cheia = compradas !== null && cobertas >= compradas;

  const mudar = (uid: string, campo: 'productKey' | 'seats', valor: string) => {
    onChange(linhas.map((linha) => (linha.uid === uid ? { ...linha, [campo]: valor } : linha)));
  };

  const colar = (uid: string, evento: React.ClipboardEvent<HTMLInputElement>) => {
    const texto = evento.clipboardData.getData('text');
    if (!/[\r\n]/.test(texto)) return;
    evento.preventDefault();

    const coladas = texto.split(/\r?\n/).map((linha) => linha.trim()).filter((linha) => linha !== '');
    const indice = linhas.findIndex((linha) => linha.uid === uid);
    const atual = linhas[indice];
    // No campo vazio, a primeira linha colada fica nele; as outras viram chaves
    // novas no fim da lista.
    const [primeira, ...resto] = atual.productKey.trim() === '' ? coladas : ['', ...coladas];
    const novas = resto.map((chave) => linhaNova(chave));
    onChange([
      ...linhas.slice(0, indice),
      primeira ? { ...atual, productKey: primeira } : atual,
      ...linhas.slice(indice + 1),
      ...novas,
    ]);
  };

  return (
    <div className="space-y-2">
      {compradas !== null && (
        <span className={`block text-[10px] ${cobertas > compradas ? 'text-status-danger' : 'text-text-tertiary'}`}>
          {cobertas > compradas
            ? `As chaves cobrem ${cobertas}, mais do que as ${compradas} compradas.`
            : `${cobertas} de ${compradas} ${compradas === 1 ? 'licença' : 'licenças'} com chave.`}
        </span>
      )}

      {linhas.map((linha, posicao) => (
        <div key={linha.uid} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-text-tertiary">{posicao + 1}.</span>
          <input
            value={linha.productKey}
            onChange={(evento) => mudar(linha.uid, 'productKey', evento.target.value)}
            onPaste={(evento) => colar(linha.uid, evento)}
            aria-label={`Chave ${posicao + 1}`}
            spellCheck={false}
            autoComplete="off"
            className={`${classeCampo} font-mono flex-1 min-w-0`}
          />
          <label className="flex items-center gap-1.5 shrink-0 text-[10px] text-text-tertiary uppercase tracking-widest">
            cobre
            <input
              type="number"
              min={Math.max(1, linha.emUso)}
              step={1}
              value={linha.seats}
              onChange={(evento) => mudar(linha.uid, 'seats', evento.target.value)}
              aria-label={`Quantas licenças a chave ${posicao + 1} cobre`}
              className={`${classeCampo} w-20`}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(linhas.filter((outra) => outra.uid !== linha.uid))}
            disabled={linha.jaEntregue}
            aria-label={`Tirar a chave ${posicao + 1}`}
            title={linha.jaEntregue ? 'Já foi entregue: não sai da lista' : 'Tirar esta chave'}
            className="p-1.5 text-text-tertiary hover:text-status-danger transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...linhas, linhaNova()])}
        disabled={cheia}
        title={cheia ? 'As chaves já cobrem todas as compradas: aumente a quantidade para adicionar' : 'Adicionar chave'}
        className={BOTAO}
      >
        <Plus size={12} /> Adicionar chave
      </button>

      <span className="block text-[10px] text-text-tertiary leading-relaxed">
        A chave individual cobre 1 licença; a de volume, várias. Colar uma lista com várias linhas
        cria uma chave para cada. Com chaves cadastradas, toda entrega escolhe uma delas. Elas só
        aparecem no detalhe da licença, escondidas até alguém pedir para mostrar.
      </span>
    </div>
  );
}
