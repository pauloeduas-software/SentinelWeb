import { Plus, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cobertasPelas, linhaNova, type LinhaDeChave } from '../helpers/licenca.helper';

// AS CHAVES DO PRODUTO NO FORMULÁRIO (AC) — uma embaixo da outra, cada uma com
// quantas licenças ela cobre.
//
// ─────────────────────────────────────────────────────────────────────────────
// A chave individual cobre 1; a de volume, várias. Juntas, não passam da
// quantidade comprada — o "Adicionar" para quando chegam lá, e o servidor
// responde 422 se a conta passar por outro caminho.
//
// A CHAVE COM ENTREGA ABERTA NÃO SAI DA LISTA, nem cobre menos do que as
// entregas abertas com ela: o ✕ fica desabilitado, e o "cobre" não desce além
// disso. A que só tem entregas devolvidas sai (AK). O texto dela pode mudar — é
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
}

export default function ChavesDoFormulario({ linhas, compradas, onChange }: ChavesDoFormularioProps) {
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
        <p className={cobertas > compradas ? 'text-sm text-status-danger' : 'text-sm text-text-secondary'}>
          {cobertas > compradas
            ? `As chaves cobrem ${cobertas}, mais do que as ${compradas} compradas.`
            : `${cobertas} de ${compradas} ${compradas === 1 ? 'licença' : 'licenças'} com chave.`}
        </p>
      )}

      {linhas.map((linha, posicao) => (
        <div key={linha.uid} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-sm text-text-tertiary">{posicao + 1}.</span>
          <Input
            value={linha.productKey}
            onChange={(evento) => mudar(linha.uid, 'productKey', evento.target.value)}
            onPaste={(evento) => colar(linha.uid, evento)}
            aria-label={`Chave ${posicao + 1}`}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 font-mono"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-tertiary">
            cobre
            <Input
              type="number"
              min={Math.max(1, linha.emUso)}
              step={1}
              value={linha.seats}
              onChange={(evento) => mudar(linha.uid, 'seats', evento.target.value)}
              aria-label={`Quantas licenças a chave ${posicao + 1} cobre`}
              className="w-20"
            />
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(linhas.filter((outra) => outra.uid !== linha.uid))}
            disabled={linha.emUso > 0}
            title={linha.emUso > 0 ? `Com ${linha.emUso} ${linha.emUso === 1 ? 'entrega aberta' : 'entregas abertas'}: devolva para tirar` : 'Tirar esta chave'}
            aria-label={`Tirar a chave ${posicao + 1}`}
          >
            <X />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...linhas, linhaNova()])}
        disabled={cheia}
        title={cheia ? 'As chaves já cobrem todas as compradas: aumente a quantidade para adicionar' : undefined}
      >
        <Plus /> Adicionar chave
      </Button>

      <p className="text-sm leading-relaxed text-text-secondary">
        A chave individual cobre 1 licença; a de volume, várias. Colar uma lista com várias linhas
        cria uma chave para cada. Com chaves cadastradas, toda entrega escolhe uma delas.
      </p>
    </div>
  );
}
