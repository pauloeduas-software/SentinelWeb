import { ArrowLeft, Boxes, HardDrive, History, LogOut, MapPin, ScrollText, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import HistoryPanel from './components/HistoryPanel';
import OffboardModal from './components/OffboardModal';
import { useUserDetail } from './hooks/useUserDetail';
import { formatarData } from '../../helpers/format.helper';
import type { Asset, PostoDoAtivo } from '../../../domain/shared/asset.types';

// PERFIL DO COLABORADOR — a Camada 3 vista do lado da pessoa
// (docs/MODELO-POSSE.md).
//
// A tela existe para responder "o que a Laura responde?" e, logo em seguida, "o
// que acontece quando ela sair?". Por isso ela mostra CINCO listas:
//
//   1. ativos no NOME dela        posse direta — some com uma devolução
//   2. ativos pelos POSTOS        herdados da ocupação — somem com a escala
//   3. ACESSÓRIOS (F5)            numa lista só, com a `via` em cada linha
//   4. ASSENTOS de licença (F6)   só os de alvo `USER` — os do ativo são da
//                                 máquina e aparecem na aba Licenças dele
//   5. os POSTOS que ela ocupa    inclusive os que não têm ativo nenhum
//
// Juntar 1 e 2 numa lista só é o erro que o MODELO-POSSE.md descreve: devolver
// um ativo da Mesa 1 pelo perfil da Laura tiraria da Ana junto.
//
// A 4 é a que não se vê em lugar nenhum se não estiver aqui — ninguém tropeça
// num assento de licença como tropeça num notebook em cima da mesa —, e é a
// única que o desligamento pode DESTRUIR em vez de devolver (D43).
//
// Embaixo das cinco vem o HISTÓRICO, e a ordem é o argumento: as listas dizem o
// que ESTÁ com a pessoa hoje — é com elas que se decide o desligamento —, e o
// histórico diz o que FOI. Um ativo devolvido mês passado não aparece em
// nenhuma delas, e é ele que responde "já teve um notebook antes?".

const CELULA = 'px-6 py-3';
const CABECALHO = 'px-6 py-3 font-normal';

export default function UserDetailPage() {
  const {
    user, diretos, porPosto, acessorios, assentos, ocupacoes, carregando, erro,
    historico, totalDoHistorico, carregandoHistorico,
    modalDesligamento, abrirDesligamento, fecharDesligamento,
    handleDesligar, desligando, resultado,
  } = useUserDetail();

  if (carregando) {
    return <p className="font-mono text-xs text-text-tertiary">Carregando colaborador...</p>;
  }

  if (erro || !user) {
    return (
      <div className="font-mono text-xs space-y-4">
        <p className="text-status-danger">{erro ?? 'Colaborador não encontrado.'}</p>
        <Link to="/users" className="text-text-tertiary hover:text-text-primary flex items-center gap-2">
          <ArrowLeft size={14} /> Voltar para a lista
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-8">

      <div className="flex justify-between items-end gap-6 flex-wrap">
        <div className="space-y-2">
          <Link to="/users" className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary flex items-center gap-2">
            <ArrowLeft size={12} /> Colaboradores
          </Link>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">{user.name}</h2>
          <div className="flex items-center gap-4 font-mono text-xs text-text-tertiary flex-wrap">
            <span>{user.email}</span>
            <span>{user.department || 'sem departamento'}</span>
            {user.terminatedAt ? (
              // O desligamento é a primeira coisa que a tela precisa dizer:
              // todo número abaixo dele tem que ser lido como histórico.
              <span className="flex items-center gap-2 text-status-warning">
                <UserX size={12} /> desligado em {formatarData(user.terminatedAt)}
              </span>
            ) : (
              <span className="text-status-success">ativo</span>
            )}
          </div>
        </div>

        {!user.terminatedAt && (
          <button
            onClick={abrirDesligamento}
            className="flex items-center gap-2 px-4 py-2 border border-status-danger/40 text-status-danger hover:bg-status-danger/10 font-mono text-xs uppercase tracking-widest transition-colors"
          >
            <LogOut size={14} /> Desligar colaborador
          </button>
        )}
      </div>

      <Secao
        icone={HardDrive}
        titulo={`Em nome de ${user.name}`}
        // A frase explica a diferença ANTES de a pessoa clicar em devolver na
        // lista errada.
        ajuda="Posse direta: sai do nome dela com uma devolução."
        vazio="Nenhum ativo entregue diretamente."
        total={diretos.length}
      >
        {diretos.map((asset) => (
          <tr key={asset.id} className="hover:bg-bg-base transition-colors">
            <td className={`${CELULA} text-text-primary`}>{asset.assetTag}</td>
            <td className={CELULA}>{asset.model.manufacturer.name} {asset.model.name}</td>
            <td className={CELULA}>{asset.status.name}</td>
            <td className={`${CELULA} text-text-tertiary`}>{asset.location?.name ?? '—'}</td>
          </tr>
        ))}
      </Secao>

      <Secao
        icone={MapPin}
        titulo="Pelos postos que ocupa"
        ajuda="Responsabilidade herdada do posto, junto com os outros ocupantes. Não se devolve por aqui: muda com a escala."
        vazio="Nenhum ativo herdado de posto."
        total={porPosto.length}
        colunaFinal="Posto"
      >
        {porPosto.map((asset: Asset & { posto: PostoDoAtivo }) => (
          <tr key={asset.id} className="hover:bg-bg-base transition-colors">
            <td className={`${CELULA} text-text-primary`}>{asset.assetTag}</td>
            <td className={CELULA}>{asset.model.manufacturer.name} {asset.model.name}</td>
            <td className={CELULA}>{asset.status.name}</td>
            <td className={`${CELULA} text-text-tertiary`}>
              {asset.posto.locationName}
              {asset.posto.shift && <span> ({asset.posto.shift})</span>}
            </td>
          </tr>
        ))}
      </Secao>

      {/* OS ACESSÓRIOS (F5) — uma lista só, com a `via` em cada linha.
          Os ativos ficam em DUAS listas porque a devolução de cada grupo é uma
          operação diferente; uma unidade de acessório se devolve do mesmo jeito
          nos dois casos, e é o `via` que diz de quem ela é. O que não existe
          nesta tela é um TOTAL: somar direto com compartilhado produz uma frase
          falsa sobre o patrimônio (D33). */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Boxes size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Acessórios <span className="text-text-tertiary">({acessorios.length})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          <span className="text-text-secondary">Direto</span> é dela e volta com ela — o
          desligamento devolve. <span className="text-text-secondary">Posto</span> é da mesa:
          ela responde junto com os outros ocupantes pela MESMA unidade, e sair do posto basta.
        </p>

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Item</th>
                <th className={CABECALHO}>Categoria</th>
                <th className={CABECALHO}>Via</th>
                <th className={CABECALHO}>Desde</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {acessorios.map((acessorio) => (
                <tr key={acessorio.checkoutId} className="hover:bg-bg-base transition-colors">
                  <td className={CELULA}>{acessorio.name}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{acessorio.categoryName ?? '—'}</td>
                  <td className={CELULA}>
                    {acessorio.via === 'DIRETO' ? (
                      <span className="text-text-secondary">Direto</span>
                    ) : (
                      <span className="text-text-tertiary">
                        Posto — {acessorio.posto?.locationName ?? '—'}
                        {acessorio.posto?.shift && <span> ({acessorio.posto.shift})</span>}
                      </span>
                    )}
                  </td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarData(acessorio.checkedOutAt)}</td>
                </tr>
              ))}
              {acessorios.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-text-tertiary">
                    Nenhum acessório com esta pessoa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OS ASSENTOS DE LICENÇA (F6, D93).
          Só os de alvo `USER` — os assentos dos ativos dela são da MÁQUINA e
          aparecem na aba Licenças daquele ativo, que é de onde alguém consegue
          devolvê-los. Mostrá-los aqui faria o operador procurar no desligamento
          uma devolução que ele nunca vai ver acontecer.
          A coluna "Na devolução" é a que justifica a seção existir: com
          `reassignable = false`, devolver DESTRÓI o assento, e este é o único
          lugar onde isso aparece antes de alguém clicar em desligar. */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <ScrollText size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Licenças <span className="text-text-tertiary">({assentos.length})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          Assentos no NOME desta pessoa — o desligamento devolve todos. Os assentos dos
          ativos dela não aparecem aqui: são da máquina, e continuam com ela quando a
          pessoa sai.
        </p>

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Licença</th>
                <th className={CABECALHO}>Categoria</th>
                <th className={CABECALHO}>Assento</th>
                <th className={CABECALHO}>Na devolução</th>
                <th className={CABECALHO}>Desde</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {assentos.map((assento) => (
                <tr key={assento.checkoutId} className="hover:bg-bg-base transition-colors">
                  {/* Texto, não link: a licença não tem URL própria — a tela
                      `/licencas` abre o detalhe num modal, e um link para a
                      lista prometeria abrir ESTA licença e entregaria a lista
                      inteira. Quando `/licencas/:id` existir, vira link. */}
                  <td className={CELULA}>{assento.licenseName}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{assento.categoryName ?? '—'}</td>
                  <td className={`${CELULA} text-text-tertiary`}>#{assento.seatNumber}</td>
                  <td className={CELULA}>
                    {assento.reassignable ? (
                      <span className="text-text-tertiary">Volta ao contrato</span>
                    ) : (
                      <span className="text-status-warning">QUEIMA — não volta</span>
                    )}
                  </td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarData(assento.checkoutAt)}</td>
                </tr>
              ))}
              {assentos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-text-tertiary">
                    Nenhum assento de licença com esta pessoa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <MapPin size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Postos ocupados <span className="text-text-tertiary">({ocupacoes.length})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          Aparecem aqui inclusive os postos sem ativo nenhum — é uma ocupação aberta, e o
          desligamento precisa encerrá-la.
        </p>

        <div className="bg-surface-card border border-border-sutil overflow-x-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
              <tr>
                <th className={CABECALHO}>Posto</th>
                <th className={CABECALHO}>Turno</th>
                <th className={CABECALHO}>Desde</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {ocupacoes.map((ocupacao) => (
                <tr key={ocupacao.id} className="hover:bg-bg-base transition-colors">
                  <td className={CELULA}>{ocupacao.location?.name ?? '—'}</td>
                  <td className={CELULA}>{ocupacao.shift || '—'}</td>
                  <td className={`${CELULA} text-text-tertiary`}>{formatarData(ocupacao.startedAt)}</td>
                </tr>
              ))}
              {ocupacoes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-10 text-center text-text-tertiary">
                    Não ocupa nenhum posto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <History size={14} className="text-text-tertiary" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Histórico <span className="text-text-tertiary">({totalDoHistorico})</span>
          </h3>
        </div>
        <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">
          O que aconteceu COM esta pessoa: cadastro e edições, entregas e devoluções, entradas e
          saídas de posto. O que ela fez como operadora do sistema é outro relatório.
        </p>

        <HistoryPanel eventos={historico} total={totalDoHistorico} carregando={carregandoHistorico} />
      </div>

      {modalDesligamento && (
        <OffboardModal
          nome={user.name}
          diretos={diretos}
          porPosto={porPosto}
          acessorios={acessorios}
          assentos={assentos}
          ocupacoes={ocupacoes}
          onClose={fecharDesligamento}
          onConfirmar={handleDesligar}
          salvando={desligando}
          resultado={resultado}
        />
      )}
    </div>
  );
}

/** Uma lista de ativos com o mesmo cabeçalho — as duas seções de posse. */
function Secao({
  icone: Icone, titulo, ajuda, vazio, total, colunaFinal = 'Localização', children,
}: {
  icone: typeof HardDrive;
  titulo: string;
  ajuda: string;
  vazio: string;
  total: number;
  colunaFinal?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <Icone size={14} className="text-text-tertiary" />
        <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary">
          {titulo} <span className="text-text-tertiary">({total})</span>
        </h3>
      </div>
      <p className="font-mono text-[10px] text-text-tertiary mb-3 leading-relaxed">{ajuda}</p>

      <div className="bg-surface-card border border-border-sutil overflow-x-auto">
        <table className="w-full text-left font-mono text-xs whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
            <tr>
              <th className={CABECALHO}>Etiqueta</th>
              <th className={CABECALHO}>Modelo</th>
              <th className={CABECALHO}>Status</th>
              <th className={CABECALHO}>{colunaFinal}</th>
            </tr>
          </thead>
          <tbody className="text-text-primary divide-y divide-border-sutil/50">
            {children}
            {total === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-text-tertiary">{vazio}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
