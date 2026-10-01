import { useMemo, useState } from 'react';
import {
  useAplicarImportacao, useCamposDoAlvoQuery, useImportQuery, useLinhasDoImportQuery,
  useSubirImportacao, urlDoModelo,
} from '../../../domain/import/import.queries';
import type {
  AlvoDeImport, MapeamentoDeImport, SituacaoDaLinha,
} from '../../../domain/shared/import.types';
import { lerCabecalhos, sugerirMapeamento } from '../helpers/cabecalhos.helper';

const LINHAS_POR_PAGINA = 25;

// O ESTADO DA TELA DE IMPORTAÇÃO (F10, Etapa D).
//
// TRÊS ETAPAS, E A PESSOA SÓ AVANÇA PORQUE A ANTERIOR DEU CERTO:
//
//   `arquivo`   escolher o alvo e o arquivo → a tela lê os cabeçalhos
//   `mapa`      casar cabeçalho com campo e escolher a chave → sobe e SIMULA
//   `relatorio` ver linha por linha o que vai acontecer → aplicar
//
// A terceira etapa é a razão de a fase existir (D68): é ali que se percebe que a
// coluna *Local* veio trocada, ANTES de 300 equipamentos mudarem de dono.
export type EtapaDaImportacao = 'arquivo' | 'mapa' | 'relatorio';

export function useImportacao() {
  const [etapa, setEtapa] = useState<EtapaDaImportacao>('arquivo');
  const [target, setTarget] = useState<AlvoDeImport>('ASSETS');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [cabecalhos, setCabecalhos] = useState<string[]>([]);
  const [delimitador, setDelimitador] = useState(';');
  const [colunas, setColunas] = useState<Record<string, string>>({});
  const [chave, setChave] = useState<string | undefined>();
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const [importId, setImportId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<SituacaoDaLinha | 'TODAS'>('TODAS');
  const [pagina, setPagina] = useState(1);

  const campos = useCamposDoAlvoQuery(target);
  const importacao = useImportQuery(importId);
  const linhas = useLinhasDoImportQuery(importId, filtro, pagina, LINHAS_POR_PAGINA);
  const subir = useSubirImportacao();
  const aplicar = useAplicarImportacao();

  /** Trocar o alvo descarta o que foi mapeado: os campos são outros. */
  const trocarAlvo = (proximo: AlvoDeImport) => {
    setTarget(proximo);
    setArquivo(null);
    setCabecalhos([]);
    setColunas({});
    setChave(undefined);
    setErroLocal(null);
    setEtapa('arquivo');
  };

  const escolherArquivo = async (escolhido: File) => {
    setErroLocal(null);

    try {
      const lido = await lerCabecalhos(escolhido);

      if (lido.cabecalhos.length === 0) {
        setErroLocal('Não foi possível ler a linha de cabeçalho do arquivo.');
        return;
      }

      setArquivo(escolhido);
      setCabecalhos(lido.cabecalhos);
      setDelimitador(lido.delimitador);

      // O MAPEAMENTO JÁ VEM SUGERIDO: quem baixou o modelo não precisa casar
      // quinze colunas à mão. Sugestão errada a pessoa troca; sugestão ausente
      // custa quinze escolhas em todo arquivo.
      const sugerido = sugerirMapeamento(lido.cabecalhos, campos.data?.campos ?? []);
      setColunas(sugerido);

      // A chave sugerida é a PRIMEIRA aceita que foi mapeada — e `undefined`
      // quando o alvo não usa chave (`OCCUPANTS`).
      const aceitas = campos.data?.chaves ?? [];
      const mapeados = new Set(Object.values(sugerido));
      setChave(aceitas.find((aceita) => mapeados.has(aceita)));

      setEtapa('mapa');
    } catch {
      setErroLocal('Não foi possível abrir o arquivo. Ele é um CSV?');
    }
  };

  const mapear = (cabecalho: string, token: string) => {
    setColunas((atual) => {
      const proximo = { ...atual };

      if (token === '') delete proximo[cabecalho];
      else {
        // Um campo recebe UMA coluna: o servidor recusa o contrário com 422, e
        // é mais honesto a tela tirar o campo da outra coluna do que deixar a
        // pessoa montar um mapeamento que vai ser recusado.
        for (const [titulo, atribuido] of Object.entries(proximo)) {
          if (atribuido === token) delete proximo[titulo];
        }
        proximo[cabecalho] = token;
      }

      return proximo;
    });
  };

  const mapeamento = useMemo<MapeamentoDeImport>(
    () => ({ colunas, ...(chave ? { chave } : {}) }),
    [colunas, chave],
  );

  const handleSimular = async () => {
    if (!arquivo) return;

    const resultado = await subir.mutateAsync({ target, mapeamento, file: arquivo });
    setImportId(resultado.id);
    setFiltro('TODAS');
    setPagina(1);
    setEtapa('relatorio');
  };

  const handleAplicar = async () => {
    if (!importId) return;
    await aplicar.mutateAsync(importId);
    setPagina(1);
  };

  const recomecar = () => {
    setImportId(null);
    setArquivo(null);
    setCabecalhos([]);
    setColunas({});
    setChave(undefined);
    setEtapa('arquivo');
  };

  return {
    etapa,
    target,
    trocarAlvo,
    urlDoModelo: urlDoModelo(target),

    arquivo,
    cabecalhos,
    delimitador,
    escolherArquivo,
    erroLocal,

    campos: campos.data,
    colunas,
    mapear,
    chave,
    setChave,
    // Sem coluna mapeada não há o que simular; a chave é cobrada pelo servidor,
    // com a mensagem que explica por quê.
    podeSimular: arquivo !== null && Object.keys(colunas).length > 0,
    simulando: subir.isPending,
    erroDaSimulacao: subir.error?.message ?? null,
    handleSimular,

    importacao: importacao.data,
    linhas: linhas.data?.rows ?? [],
    totalDeLinhas: linhas.data?.total ?? 0,
    filtro,
    trocarFiltro: (proximo: SituacaoDaLinha | 'TODAS') => { setFiltro(proximo); setPagina(1); },
    pagina,
    setPagina,
    linhasPorPagina: LINHAS_POR_PAGINA,
    aplicando: aplicar.isPending,
    erroDoApply: aplicar.error?.message ?? null,
    handleAplicar,
    recomecar,
  };
}
