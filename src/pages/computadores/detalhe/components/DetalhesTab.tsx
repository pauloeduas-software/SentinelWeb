import { PackageX } from 'lucide-react';
import { Aviso } from '../../../../components/ui/aviso';
import { Card } from '../../../../components/ui/card';
import { Dado, GradeDeDados } from '../../../../components/ui/dado';
import type { Asset } from '../../../../types/asset.types';
import { formatarData, formatarMoeda } from '../../../../helpers/format.helper';
import { seloDaSaida } from '../../helpers/baixa.helper';
import { canaisDeSuporte, type CanalDeSuporte } from '../helpers/suporte.helper';

// A FICHA do ativo. Só leitura: editar é o formulário que já existe, e duplicar os
// campos aqui em modo de edição criaria dois formulários para a mesma tabela.
// Etiqueta, série, nome e onde ele está moram no card acima das abas
// (`IdentificacaoCard`), à vista em todas elas.

interface DetalhesTabProps {
  asset: Asset;
}

export default function DetalhesTab({ asset }: DetalhesTabProps) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const selo = seloDaSaida(asset);
  const canais = canaisDeSuporte(asset.model.manufacturer);
  // Sem nada da compra, a seção não aparece: um título sozinho parece ficha quebrada.
  const temCompra = Boolean(asset.orderNumber || asset.purchaseDate || asset.purchaseCost);

  return (
    <div className="space-y-4">
      {selo && (
        <Aviso tom="aviso">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <PackageX className="size-4" /> Fora do patrimônio
            </div>
            <div className="text-text-primary">{selo}</div>
            {asset.retiredNotes && <div className="text-text-secondary">{asset.retiredNotes}</div>}
            <p className="text-xs text-text-tertiary">
              Continua no histórico e na vista Baixados. Não é o mesmo que estar na lixeira, que é cadastro errado.
            </p>
          </div>
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Secao titulo="Catálogo">
          <Dado rotulo="Modelo">{asset.model.name}</Dado>
          <Dado rotulo="Fabricante">{asset.model.manufacturer.name}</Dado>
          {/* A categoria vem do MODELO, não de coluna própria — é o que impede
              ativo e modelo divergirem (asset-select.helper.ts). */}
          <Dado rotulo="Categoria">{asset.model.category.name}</Dado>
        </Secao>

        {temCompra && (
          <Secao titulo="Compra">
            <Dado rotulo="Número do pedido">{asset.orderNumber}</Dado>
            <Dado rotulo="Data da compra">{formatarData(asset.purchaseDate)}</Dado>
            {/* Ausente para quem não vê o custo (D77): sem a linha, e não um "—" que diria "sem valor". */}
            {asset.purchaseCost !== undefined && <Dado rotulo="Valor da compra">{formatarMoeda(asset.purchaseCost)}</Dado>}
          </Secao>
        )}

        {/* O SUPORTE DO FABRICANTE, logo ao lado do catálogo de onde ele vem.
            Só os canais preenchidos; sem nenhum, a seção não aparece — três
            travessões sob um título não ajudam ninguém a abrir chamado. */}
        {canais.length > 0 && (
          <Secao titulo={`Suporte · ${asset.model.manufacturer.name}`}>
            {canais.map((canal) => <CampoDeCanal key={canal.rotulo} canal={canal} />)}
          </Secao>
        )}

        {asset.notes && (
          <Card className="space-y-2 p-6">
            <h3 className="text-sm font-medium text-text-primary">Notas</h3>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{asset.notes}</p>
          </Card>
        )}
      </div>

    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-medium text-text-primary">{titulo}</h3>
      <GradeDeDados>{children}</GradeDeDados>
    </Card>
  );
}

/**
 * Um canal de suporte: o mesmo `Dado`, com o valor clicável.
 *
 * Endereço web abre em outra aba com `noopener noreferrer` — a página do
 * fabricante não ganha acesso a esta janela pelo `window.opener`, nem recebe a
 * URL da ficha (com o id do ativo) no `Referer`. Valor que não virou link sai
 * como texto.
 */
function CampoDeCanal({ canal }: { canal: CanalDeSuporte }) {
  return (
    <Dado rotulo={canal.rotulo} largo={canal.externo}>
      {canal.href ? (
        <a
          href={canal.href}
          {...(canal.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="text-link hover:underline"
        >
          {canal.texto}
        </a>
      ) : canal.texto}
    </Dado>
  );
}
