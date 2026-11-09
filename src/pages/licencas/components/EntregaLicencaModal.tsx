import { useState } from 'react';
import { Monitor, User } from 'lucide-react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Aviso } from '../../../components/ui/aviso';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { Segmentado } from '../../../components/ui/segmentado';
import { Seletor } from '../../../components/ui/seletor';
import { useLicenseQuery } from '../../../queries/license.queries';
import type { AlvoDaEntrega, Licenca } from '../../../types/license.types';
import { hojeNoCampoDeData } from '../../../helpers/format.helper';
import { chavesComLugar, lugarDaChave, rotuloDaChave } from '../helpers/licenca.helper';

// A ENTREGA DE UMA LICENÇA.
//
// ═════════════════════════════════════════════════════════════════════════════
// SÃO DOIS ALVOS, E NÃO TRÊS — posto de trabalho NÃO recebe licença (D39).
//
// A ausência é a decisão, e a ajuda do campo Ativo existe para quem for procurar
// o botão que falta: o desktop fixo da Mesa 1 é um ATIVO, e a licença vai para
// ele. Licença por assinatura de pessoa (Microsoft 365, Adobe) vai para o
// colaborador.
// ═════════════════════════════════════════════════════════════════════════════
//
// A CHAVE É ESCOLHIDA DA LISTA DA LICENÇA (AC), e não digitada: é o que diz
// qual chave está com cada um. A lista vem do detalhe, que é a leitura com as
// chaves. Com chaves cadastradas, escolher é obrigatório; só aparecem as que têm
// lugar, e com uma só ela já vem escolhida. A licença sem chave entrega sem.

interface EntregaLicencaModalProps {
  licenca: Licenca;
  onClose: () => void;
  onSubmit: (alvo: AlvoDaEntrega) => Promise<void>;
}

export default function EntregaLicencaModal({ licenca, onClose, onSubmit }: EntregaLicencaModalProps) {
  const [alvo, setAlvo] = useState<'PERSON' | 'ASSET'>('PERSON');
  const [personId, setPersonId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [notes, setNotes] = useState('');
  const [chaveEscolhida, setChaveEscolhida] = useState('');
  // Vem com hoje; pode voltar para registrar a entrega que já aconteceu.
  const hoje = hojeNoCampoDeData();
  const [checkoutAt, setCheckoutAt] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const { data: detalhe, error: erroDoDetalhe } = useLicenseQuery(licenca.id);
  // A conta do cabeçalho vem do detalhe, e não da linha da lista: depois de um
  // 409 de "sem livre", a consulta é buscada de novo e o número acompanha.
  const atual = detalhe ?? licenca;
  const chaves = detalhe?.keys ?? [];
  const comLugar = chavesComLugar(chaves);
  // Com uma chave só com lugar, ela já vem escolhida.
  const licenseKeyId = chaveEscolhida || (comLugar.length === 1 ? comLugar[0].id : '');
  const chaveResolvida = detalhe !== undefined && (chaves.length === 0 || licenseKeyId !== '');

  const pronto = (alvo === 'PERSON' ? personId !== '' : assetId !== '') && checkoutAt !== '' && chaveResolvida;

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    // SÓ a chave do alvo escolhido vai no corpo. Mandar as duas responde 422
    // pelo use-case, e o banco tem o CHECK por baixo — mas montar o corpo certo
    // aqui é o que faz o erro nunca acontecer por descuido da tela.
    const comum = { notes: notes.trim() || null, checkoutAt, ...(licenseKeyId ? { licenseKeyId } : {}) };
    const corpo: AlvoDaEntrega = alvo === 'PERSON'
      ? { assignedPersonId: personId, ...comum }
      : { assignedAssetId: assetId, ...comum };

    try {
      await onSubmit(corpo);
    } catch (falha) {
      // É aqui que aparecem o 409 de sem licença livre (com os números), o do
      // alvo que já está com ela, o da chave que outra aba tomou no meio, o do
      // colaborador desativado e o do ativo baixado.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Entregar licença"
      descricao={`${atual.name} · ${atual.livres} de ${atual.seatsTotal} ${atual.livres === 1 ? 'livre' : 'livres'}`}
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={!pronto}
      rotuloDoEnvio="Entregar"
      rotuloEnviando="Entregando…"
    >
      <Segmentado
        opcoes={[
          { valor: 'PERSON', rotulo: <><User /> Colaborador</> },
          { valor: 'ASSET', rotulo: <><Monitor /> Ativo</> },
        ]}
        valor={alvo}
        onChange={setAlvo}
      />

      {alvo === 'PERSON' ? (
        <Campo rotulo="Colaborador" obrigatorio ajuda="Assinatura de pessoa, como Microsoft 365 e Adobe.">
          <ReferenceSelect rota="people" valor={personId} obrigatorio comDetalhe onChange={setPersonId} />
        </Campo>
      ) : (
        <Campo rotulo="Ativo" obrigatorio>
          <ReferenceSelect rota="assets" valor={assetId} obrigatorio onChange={setAssetId} />
        </Campo>
      )}

      <Campo rotulo="Data da entrega" obrigatorio>
        <Input type="date" required max={hoje} value={checkoutAt} onChange={(e) => setCheckoutAt(e.target.value)} />
      </Campo>

      {erroDoDetalhe ? (
        <Aviso>Não foi possível carregar as chaves: {erroDoDetalhe.message}</Aviso>
      ) : !detalhe ? (
        <p className="text-sm text-text-tertiary">Carregando as chaves…</p>
      ) : chaves.length > 0 && (
        comLugar.length === 0 ? (
          <Aviso tom="aviso">
            Todas as chaves desta licença estão em uso. Cadastre a chave da próxima licença, em
            Editar, antes de entregar.
          </Aviso>
        ) : (
          <Campo rotulo="Chave" obrigatorio>
            <Seletor
              value={licenseKeyId}
              onChange={setChaveEscolhida}
              obrigatorio
              vazio="Escolha a chave…"
              placeholderDaBusca="Buscar chave…"
              opcoesMono
              className={licenseKeyId ? 'font-mono' : undefined}
              // A posição vem da lista inteira: é o mesmo número da ficha.
              opcoes={chaves.flatMap((chave, indice) => (comLugar.includes(chave)
                ? [{ value: chave.id, label: rotuloDaChave(chave, indice + 1), detalhe: lugarDaChave(chave) }]
                : []))}
            />
          </Campo>
        )
      )}

      <Campo rotulo="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Campo>

      <p className="text-sm leading-relaxed text-text-secondary">
        Licença por computador (Windows, Office avulso) vai para o ativo; por assinatura de pessoa
        (Microsoft 365, Adobe), para o colaborador. Posto de trabalho não recebe licença: o
        computador da mesa recebe.
      </p>
    </FormularioLateral>
  );
}
