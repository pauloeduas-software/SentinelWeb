import { useState } from 'react';
import { Link } from 'react-router-dom';
import FormularioLateral from '../../../../components/FormularioLateral';
import { Aviso } from '../../../../components/ui/aviso';
import { Campo } from '../../../../components/ui/campo';
import { Input, Textarea } from '../../../../components/ui/input';
import { Seletor } from '../../../../components/ui/seletor';
import type { Asset, RetireInput } from '../../../../types/asset.types';
import { hojeNoCampoDeData } from '../../../../helpers/format.helper';
import { MOTIVOS_DA_SAIDA } from '../../helpers/baixa.helper';
import type { LinkDaNotificacao } from '../../../../hooks/useNotificacao';
import { linksDoErro } from '../../../../helpers/erro.helper';

// DAR BAIXA — registrar que o ativo saiu do PATRIMÔNIO.
//
// Modal próprio, e não um campo do formulário de ativo, pelo mesmo motivo da
// entrega: é uma OPERAÇÃO, com data, motivo e recusa própria (ativo entregue
// não sai do patrimônio). Como campo, viraria um seletor que alguém muda sem
// perceber ao editar o número de série.
//
// As duas saídas são diferentes (D19) e o texto abaixo diz isso na hora da
// decisão, que é quando a dúvida existe: a lixeira é para cadastro errado, e
// isto aqui é o fato contábil de que o bem saiu.

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
    <FormularioLateral
      titulo={`Dar baixa em ${asset.assetTag}`}
      descricao="Sai do patrimônio e das listagens, e fica na vista Baixados com a data e o motivo. Cadastro errado vai para a lixeira."
      onClose={onClose}
      onSubmit={enviar}
      salvando={salvando}
      rotuloDoEnvio="Confirmar saída"
      rotuloEnviando="Registrando..."
    >
      {erro && (
        <Aviso className="space-y-1.5">
          <p>{erro}</p>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {links.map((link) => (
                <Link key={link.para} to={link.para} className="underline underline-offset-2">{link.rotulo}</Link>
              ))}
            </div>
          )}
        </Aviso>
      )}

      <Campo rotulo="Motivo" obrigatorio>
        <Seletor
          value={motivo}
          onChange={(valor) => setMotivo(valor as typeof motivo)}
          opcoes={MOTIVOS_DA_SAIDA}
          vazio="Selecione..."
          placeholderDaBusca="Buscar motivo..."
          obrigatorio
        />
      </Campo>

      {/* `max` = hoje porque o servidor recusa data futura (422): uma saída
          que ainda não aconteceu não é fato a registrar. */}
      <Campo rotulo="Data da saída" obrigatorio ajuda="Vem com hoje: troque pela data em que o ativo saiu.">
        <Input type="date" required max={hoje} value={data} onChange={(event) => setData(event.target.value)} />
      </Campo>

      <Campo rotulo="Observações" ajuda="Aparece na aba Detalhes enquanto a baixa valer.">
        <Textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}
