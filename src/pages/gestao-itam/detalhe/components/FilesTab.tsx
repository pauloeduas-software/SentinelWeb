import { useRef, useState } from 'react';
import { Download, FileText, Image as ImagemIcone, Paperclip, Trash2, Upload, X } from 'lucide-react';
import type { Anexo } from '../../../../domain/shared/attachment.types';
import { urlDaImagem, urlDoAnexo } from '../../../../domain/attachment/attachment.queries';
import { formatarData } from '../../../helpers/format.helper';

// A ABA ARQUIVOS — a foto do equipamento e os anexos dele.
//
// SÃO DUAS COISAS DIFERENTES na mesma aba, e a separação visual é o conteúdo:
// a imagem é um CAMPO (uma, que a próxima substitui) e o anexo é uma LISTA (N
// notas fiscais, contratos, laudos). Juntá-las numa grade só faria a foto
// competir com a nota fiscal pelo mesmo lugar.
//
// TODO ARQUIVO AQUI EXIGE SESSÃO, inclusive a `<img src>` (D84): as URLs
// apontam para `/api/...` e o cookie viaja junto porque o `apiClient` roda com
// `withCredentials`. Não há caminho de disco em lugar nenhum desta tela.

const MB = 1024 * 1024;

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

interface FilesTabProps {
  assetId: string;
  temImagem: boolean;
  anexos: Anexo[];
  carregando: boolean;
  enviando: boolean;
  erro: string | null;
  onAnexar: (file: File) => void;
  onExcluirAnexo: (id: string) => void;
  onTrocarImagem: (file: File) => void;
  onRemoverImagem: () => void;
}

export default function FilesTab({
  assetId, temImagem, anexos, carregando, enviando, erro,
  onAnexar, onExcluirAnexo, onTrocarImagem, onRemoverImagem,
}: FilesTabProps) {
  return (
    <div className="space-y-8">
      {erro && <p className="text-status-danger text-[10px]">{erro}</p>}

      <Imagem
        assetId={assetId}
        temImagem={temImagem}
        enviando={enviando}
        onTrocar={onTrocarImagem}
        onRemover={onRemoverImagem}
      />

      <Anexos
        anexos={anexos}
        carregando={carregando}
        enviando={enviando}
        onAnexar={onAnexar}
        onExcluir={onExcluirAnexo}
      />
    </div>
  );
}

function Imagem({
  assetId, temImagem, enviando, onTrocar, onRemover,
}: {
  assetId: string;
  temImagem: boolean;
  enviando: boolean;
  onTrocar: (file: File) => void;
  onRemover: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  // `key` mudando a cada troca força o navegador a buscar de novo: a URL é a
  // MESMA (`/api/images/asset/:id`, por id), então sem isto a foto antiga
  // ficaria no cache do `<img>` e a troca pareceria não ter funcionado.
  const [versao, setVersao] = useState(0);

  const escolher = (file: File | undefined) => {
    if (!file) return;
    onTrocar(file);
    setVersao((v) => v + 1);
  };

  return (
    <section>
      <Titulo icone={ImagemIcone} texto="Foto do ativo" />
      <p className="text-text-tertiary text-[10px] mb-3 leading-relaxed">
        Uma por ativo — enviar outra substitui a atual. JPG, PNG, WEBP ou GIF, até 10 MB.
      </p>

      <div className="flex flex-wrap items-start gap-4">
        <div className="w-40 h-40 border border-border-sutil bg-bg-base flex items-center justify-center overflow-hidden shrink-0">
          {temImagem ? (
            <img
              key={versao}
              src={`${urlDaImagem('asset', assetId)}?v=${versao}`}
              alt="Foto do ativo"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImagemIcone size={24} className="text-text-tertiary opacity-40" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              escolher(e.target.files?.[0]);
              // Zera o input: escolher o MESMO arquivo duas vezes seguidas não
              // dispara `change` se o valor não mudar.
              e.target.value = '';
            }}
          />
          <Botao onClick={() => input.current?.click()} disabled={enviando} icone={Upload}>
            {temImagem ? 'Trocar foto' : 'Enviar foto'}
          </Botao>
          {temImagem && (
            <Botao onClick={onRemover} disabled={enviando} icone={X} perigo>
              Remover foto
            </Botao>
          )}
        </div>
      </div>
    </section>
  );
}

function Anexos({
  anexos, carregando, enviando, onAnexar, onExcluir,
}: {
  anexos: Anexo[];
  carregando: boolean;
  enviando: boolean;
  onAnexar: (file: File) => void;
  onExcluir: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <section>
      <Titulo icone={Paperclip} texto={`Anexos (${anexos.length})`} />
      <p className="text-text-tertiary text-[10px] mb-3 leading-relaxed">
        Nota fiscal, contrato, laudo. PDF ou imagem, até 10 MB cada. Mandar o ativo para a lixeira
        <strong className="text-text-secondary"> não</strong> apaga os anexos — restaurar devolve tudo.
      </p>

      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAnexar(file);
          e.target.value = '';
        }}
      />
      <div className="mb-3">
        <Botao onClick={() => input.current?.click()} disabled={enviando} icone={Upload}>
          {enviando ? 'Enviando…' : 'Anexar arquivo'}
        </Botao>
      </div>

      {carregando ? (
        <p className="text-text-tertiary">Carregando anexos…</p>
      ) : anexos.length === 0 ? (
        <p className="text-text-tertiary">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="divide-y divide-border-sutil/50 border border-border-sutil">
          {anexos.map((anexo) => (
            <li key={anexo.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-bg-base transition-colors">
              <FileText size={13} className="text-text-tertiary shrink-0" />
              <span className="text-text-primary flex-1 min-w-0 truncate" title={anexo.originalName}>
                {anexo.originalName}
              </span>
              <span className="text-text-tertiary text-[10px] tabular-nums shrink-0">
                {tamanhoLegivel(anexo.sizeBytes)}
              </span>
              <span className="text-text-tertiary text-[10px] shrink-0">
                {formatarData(anexo.createdAt)}
              </span>
              <a
                href={urlDoAnexo(anexo.id)}
                className="text-text-tertiary hover:text-status-info shrink-0"
                title="Baixar"
              >
                <Download size={13} />
              </a>
              <button
                type="button"
                onClick={() => onExcluir(anexo.id)}
                className="text-text-tertiary hover:text-status-danger shrink-0"
                title="Excluir anexo"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Titulo({ icone: Icone, texto }: { icone: typeof Paperclip; texto: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <Icone size={14} className="text-text-tertiary" />
      <h3 className="uppercase tracking-widest text-text-secondary">{texto}</h3>
    </div>
  );
}

function Botao({
  onClick, disabled, icone: Icone, perigo, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icone: typeof Upload;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  const cor = perigo
    ? 'border-status-danger/40 text-status-danger hover:bg-status-danger/10'
    : 'border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 border uppercase tracking-widest transition-colors disabled:opacity-40 ${cor}`}
    >
      <Icone size={13} /> {children}
    </button>
  );
}
