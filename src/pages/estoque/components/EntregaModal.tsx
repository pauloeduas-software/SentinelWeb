import { useState } from 'react';
import { MapPin, User } from 'lucide-react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { Segmentado } from '../../../components/ui/segmentado';
import { useStockItemQuery } from '../../../queries/stock.queries';
import type { AlvoDaEntregaDeEstoque, ItemDeEstoque } from '../../../types/stock.types';
import { hojeNoCampoDeData } from '../../../helpers/format.helper';
import { ehComponente, ehConsumivel } from '../helpers/estoque.helper';

// A ENTREGA: `qty` unidades para UM colaborador ou UM posto — ou, o componente,
// UM computador —, num dia: a entrega da licença com quantidade (AE).
//
// O POSTO PODE SER ALVO, ao contrário da licença (D39 é de licença, não de
// estoque): entregar 5 mouses à Mesa 1 é o caso real do almoxarifado, e a
// unidade entregue ao posto vale UMA, qualquer que seja o número de ocupantes
// (D33). Quem responde por ela são os ocupantes abertos, resolvidos na leitura.
//
// CADA UNIDADE VIRA UMA LINHA, e por isso há um teto de 100 por entrega
// (`checkoutStockSchema`) — ninguém entrega mil mouses de uma vez pela tela.
//
// O COMPONENTE (AI) vai só para um computador: a janela dele não tem a escolha
// entre colaborador e posto, só o campo do computador.

interface EntregaModalProps {
  item: ItemDeEstoque;
  onClose: () => void;
  onSubmit: (alvo: AlvoDaEntregaDeEstoque) => Promise<void>;
}

export default function EntregaModal({ item, onClose, onSubmit }: EntregaModalProps) {
  const componente = ehComponente(item);
  const [tipo, setTipo] = useState<'PERSON' | 'WORKSTATION'>('PERSON');
  const [personId, setPersonId] = useState('');
  const [workstationId, setWorkstationId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  // Vem com hoje; pode voltar para registrar a entrega que já aconteceu.
  const hoje = hojeNoCampoDeData();
  const [checkoutAt, setCheckoutAt] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // A conta do cabeçalho vem do detalhe, e não da linha da lista: depois de um
  // 409 de "sem unidade", a consulta é buscada de novo e o número acompanha.
  const { data: detalhe } = useStockItemQuery(item.id);
  const atual = detalhe ?? item;

  const alvoId = componente ? assetId : tipo === 'PERSON' ? personId : workstationId;
  const pronto = alvoId !== '' && checkoutAt !== '';

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();

    // Em branco não vira 0 — a mesma regra da quantidade do cadastro.
    const quantidade = Number(qty);
    if (qty.trim() === '' || !Number.isInteger(quantidade) || quantidade < 1) {
      setErro('Informe a quantidade: um número inteiro, 1 ou mais.');
      return;
    }

    setSalvando(true);
    setErro('');

    // SÓ a chave do alvo escolhido vai no corpo. Mandar duas responde 422
    // pelo use-case, e o banco tem o CHECK por baixo.
    const comum = { qty: quantidade, notes: notes.trim() || null, checkoutAt };
    const corpo: AlvoDaEntregaDeEstoque = componente
      ? { targetType: 'ASSET', targetAssetId: assetId, ...comum }
      : tipo === 'PERSON'
        ? { targetType: 'PERSON', targetPersonId: personId, ...comum }
        : { targetType: 'WORKSTATION', targetWorkstationId: workstationId, ...comum };

    try {
      await onSubmit(corpo);
    } catch (falha) {
      // É aqui que aparecem o 409 de sem unidade disponível (com os números), o
      // do item desativado no meio, o do colaborador desativado, o do posto
      // desativado e o do computador baixado no meio.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Entregar item"
      descricao={`${atual.name} · ${atual.disponivel}${ehConsumivel(atual) ? '' : ` de ${atual.qty}`} ${atual.disponivel === 1 ? 'disponível' : 'disponíveis'}`}
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={!pronto}
      rotuloDoEnvio="Entregar"
      rotuloEnviando="Entregando…"
    >
      {componente ? (
        <Campo rotulo="Ativo" obrigatorio>
          <ReferenceSelect rota="assets" valor={assetId} obrigatorio onChange={setAssetId} />
        </Campo>
      ) : (
        <>
          <Segmentado
            opcoes={[
              { valor: 'PERSON', rotulo: <><User /> Colaborador</> },
              { valor: 'WORKSTATION', rotulo: <><MapPin /> Posto</> },
            ]}
            valor={tipo}
            onChange={setTipo}
          />

          {tipo === 'PERSON' ? (
            <Campo rotulo="Colaborador" obrigatorio>
              <ReferenceSelect rota="people" valor={personId} obrigatorio comDetalhe onChange={setPersonId} />
            </Campo>
          ) : (
            <Campo rotulo="Posto" obrigatorio ajuda="O posto é o responsável, e quem está nele responde pelo item.">
              <ReferenceSelect rota="workstations" valor={workstationId} obrigatorio onChange={setWorkstationId} />
            </Campo>
          )}
        </>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Campo
          rotulo="Quantidade"
          obrigatorio
          ajuda={ehConsumivel(item) ? 'Consumível não volta: a entrega tira do total. Lançou errado? Some de volta pelo Editar.' : undefined}
        >
          <Input required type="number" min={1} max={100} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Campo>

        <Campo rotulo="Data da entrega" obrigatorio>
          <Input type="date" required max={hoje} value={checkoutAt} onChange={(e) => setCheckoutAt(e.target.value)} />
        </Campo>
      </div>

      <Campo rotulo="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Campo>

      <p className="text-sm leading-relaxed text-text-secondary">
        {componente
          ? 'Fica no computador, mesmo quando os responsáveis dele mudam. Para tirar, use o Retirar na ficha do item.'
          : ehConsumivel(item)
            ? 'Consumível não volta: a entrega tira do total. Lançou errado? Some de volta pelo Editar.'
            : 'No posto, vale pela mesa: o posto é o responsável. A devolução é feita na ficha do item.'}
      </p>
    </FormularioLateral>
  );
}
