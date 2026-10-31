import { useState } from 'react';
import { PackageX, X } from 'lucide-react';
import type { Asset, RetireInput } from '../../../../types/asset.types';
import { hojeNoCampoDeData } from '../../../../helpers/format.helper';
import { MOTIVOS_DA_SAIDA } from '../../helpers/baixa.helper';
import { Link } from 'react-router-dom';
import type { LinkDaNotificacao } from '../../../../hooks/useNotificacao';
import { linksDoErro } from '../../../../helpers/erro.helper';

// DAR BAIXA — registrar que o ativo saiu do PATRIMÔNIO.
//
// Modal próprio, e não um campo do formulário de ativo, pelo mesmo motivo da
// entrega: é uma OPERAÇÃO, com data, motivo e recusa própria (ativo entregue
// não sai do patrimônio). Como campo, viraria um `<select>` que alguém muda sem
// perceber ao editar o número de série.
//
// As duas saídas são diferentes (D19) e o texto abaixo diz isso na hora da
// decisão, que é quando a dúvida existe: a lixeira é para cadastro errado, e
// isto aqui é o fato contábil de que o bem saiu.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface RetireModalProps {
  asset: Asset;
  onClose: () => void;
  onConfirmar: (data: RetireInput) => Promise<void>;
}

export default function RetireModal({ asset, onClose, onConfirmar }: RetireModalProps) {
  const [motivo, setMotivo] = useState(MOTIVOS_DA_SAIDA[0].value);
  // A data NASCE com o dia de hoje e vai sempre preenchida. "Em branco = agora"
  // mandava o servidor gravar o INSTANTE, e ele guarda a saída como dia em UTC:
  // uma baixa às 22h de Brasília aparecia com o dia seguinte. Com o dia já
  // escolhido aqui, no fuso de quem registra, não há instante para converter.
  // O `useState` com função calcula hoje uma vez, ao abrir o modal.
  const [hoje] = useState(hojeNoCampoDeData);
  const [data, setData] = useState(hoje);
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  // A baixa recusada por licença ou componente traz cada um em link, até o detalhe dele.
  const [links, setLinks] = useState<LinkDaNotificacao[]>([]);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    setLinks([]);

    try {
      // A data vai sempre: o campo é obrigatório e nasce com hoje (ver o
      // `useState` acima). Observação vazia vira AUSENTE, nunca `''`.
      await onConfirmar({
        retiredReason: motivo,
        retiredAt: data,
        ...(observacoes.trim() ? { notes: observacoes.trim() } : {}),
      });
    } catch (falha) {
      // É aqui que aparece o 409 de ativo entregue, o de ativo com licença e o
      // 422 de data futura, já traduzidos pelo apiClient.
      setErro((falha as Error).message);
      setLinks(linksDoErro(falha) ?? []);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface-card border border-border-sutil shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            <PackageX size={16} /> Dar baixa em {asset.assetTag}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-5">
          {erro && (
            <div role="alert" className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 space-y-1.5">
              <p>{erro}</p>
              {links.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {links.map((link) => (
                    <Link key={link.para} to={link.para} className="underline underline-offset-2">{link.rotulo}</Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-text-tertiary text-[10px] leading-relaxed">
            O ativo sai do PATRIMÔNIO e das listagens do dia a dia, mas continua existindo: segue
            no histórico e na vista "Baixados" da tela Computadores, com a data e o motivo da saída.
            Para desfazer um cadastro errado, use a lixeira.
          </p>

          <div className="space-y-1">
            <label className={ROTULO}>Motivo*</label>
            <select
              value={motivo}
              onChange={(event) => setMotivo(event.target.value as typeof motivo)}
              className={CLASSE_CAMPO}
            >
              {MOTIVOS_DA_SAIDA.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Data da saída*</label>
            {/* `max` = hoje porque o servidor recusa data futura (422): uma saída
                que ainda não aconteceu não é fato a registrar. */}
            <input
              type="date"
              required
              max={hoje}
              value={data}
              onChange={(event) => setData(event.target.value)}
              className={CLASSE_CAMPO}
            />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Vem com a data de hoje. A venda pode ter sido semana passada e o registro, hoje: troque
              pela data em que o ativo saiu.
            </p>
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Observações</label>
            <textarea
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              className={`${CLASSE_CAMPO} h-20 resize-none`}
            />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Aparece na aba Detalhes enquanto a baixa valer, e sai se a baixa for desfeita.
            </p>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Registrando...' : 'Confirmar saída'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
