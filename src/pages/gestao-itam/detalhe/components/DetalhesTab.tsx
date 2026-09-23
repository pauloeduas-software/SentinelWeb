import { PackageX, Undo2 } from 'lucide-react';
import type { Asset } from '../../../../domain/shared/asset.types';
import { formatarData, formatarMeses, formatarMoeda } from '../../../helpers/format.helper';
import { seloDaSaida } from '../../helpers/descomissionamento.helper';

// A FICHA do ativo. Só leitura: editar é o modal que já existe, e duplicar os
// campos aqui em modo de edição criaria dois formulários para a mesma tabela.

interface DetalhesTabProps {
  asset: Asset;
  onDescomissionar: () => void;
  onReverterSaida: () => void;
}

export default function DetalhesTab({ asset, onDescomissionar, onReverterSaida }: DetalhesTabProps) {
  // Cálculo fora do JSX (docs/ARQUITETURA.md). Os dois textos abaixo dependem
  // do mesmo dado e são lidos em dois lugares da tela.
  const selo = seloDaSaida(asset);
  const categoria = asset.model.category.name;

  return (
    <div className="space-y-6">
      {selo && (
        <div className="border border-status-warning/30 bg-status-warning/10 p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-status-warning uppercase tracking-widest text-[10px]">
              <PackageX size={13} /> Fora do patrimônio
            </div>
            <div className="text-text-primary">{selo}</div>
            <p className="text-text-tertiary text-[10px] leading-relaxed max-w-xl">
              Saiu do patrimônio — não é o mesmo que estar arquivado (fora de operação) nem na
              lixeira (cadastro errado). O ativo continua no histórico e nos relatórios com a data
              em que saiu.
            </p>
          </div>
          <button
            type="button"
            onClick={onReverterSaida}
            className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors shrink-0"
          >
            <Undo2 size={13} /> Reverter
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <Secao titulo="Identificação">
          <Campo rotulo="Etiqueta" valor={asset.assetTag} />
          <Campo rotulo="Número de série" valor={asset.serial} />
          <Campo rotulo="Nome / apelido" valor={asset.name} />
          <Campo rotulo="Cadastrado em" valor={formatarData(asset.createdAt)} />
        </Secao>

        <Secao titulo="Catálogo">
          <Campo rotulo="Modelo" valor={asset.model.name} />
          <Campo rotulo="Fabricante" valor={asset.model.manufacturer.name} />
          {/* A categoria vem do MODELO, não de coluna própria — é o que impede
              ativo e modelo divergirem (asset-select.helper.ts). */}
          <Campo rotulo="Categoria" valor={categoria} />
          <Campo rotulo="Localização" valor={asset.location?.name} />
        </Secao>

        <Secao titulo="Compra">
          <Campo rotulo="Fornecedor" valor={asset.supplier?.name} />
          <Campo rotulo="Número do pedido" valor={asset.orderNumber} />
          <Campo rotulo="Data da compra" valor={formatarData(asset.purchaseDate)} />
          <Campo rotulo="Valor" valor={formatarMoeda(asset.purchaseCost)} />
        </Secao>

        <Secao titulo="Prazos">
          <Campo rotulo="Garantia" valor={formatarMeses(asset.warrantyMonths)} />
          <Campo rotulo="Vence em" valor={formatarData(asset.warrantyExpiresAt)} />
          <Campo rotulo="Vida útil" valor={formatarMeses(asset.eolMonths)} />
          <Campo
            rotulo="Fim de vida"
            valor={formatarData(asset.eolDate)}
            nota={asset.eolExplicit ? 'definido à mão' : undefined}
          />
        </Secao>

        <Secao titulo="Outros">
          <Campo rotulo="BYOD" valor={asset.byod ? 'sim' : 'não'} />
          <Campo rotulo="Pode ser solicitado" valor={asset.requestable ? 'sim' : 'não'} />
        </Secao>

        <Secao titulo="Notas">
          <p className="col-span-2 text-text-secondary whitespace-pre-wrap leading-relaxed">
            {asset.notes || <span className="text-text-tertiary">Sem notas.</span>}
          </p>
        </Secao>
      </div>

      {!selo && (
        <div className="border-t border-border-sutil pt-4 flex items-center justify-between gap-4">
          <p className="text-text-tertiary text-[10px] leading-relaxed max-w-xl">
            <span className="text-text-secondary uppercase tracking-widest">Descomissionar</span>{' '}
            registra que o ativo saiu do patrimônio, com a data e o motivo. Ativo entregue é
            recusado: faça a devolução antes.
          </p>
          <button
            type="button"
            onClick={onDescomissionar}
            className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-secondary hover:text-status-warning hover:bg-bg-base transition-colors shrink-0"
          >
            <PackageX size={13} /> Descomissionar
          </button>
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-text-tertiary uppercase tracking-widest text-[10px] border-b border-border-sutil pb-2">
        {titulo}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

function Campo({ rotulo, valor, nota }: { rotulo: string; valor?: string | null; nota?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-text-tertiary uppercase tracking-widest text-[10px]">{rotulo}</div>
      <div className="text-text-primary break-words">{valor || '—'}</div>
      {nota && <div className="text-text-tertiary text-[10px]">{nota}</div>}
    </div>
  );
}
