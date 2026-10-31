import { Contact } from 'lucide-react';
import CadastroDoCatalogo from '../../components/catalogo/CadastroDoCatalogo';
import { caminhoDoColaborador } from '../../helpers/colaborador.helper';
import { colaborador } from './specs';

// COLABORADORES — quem recebe equipamento. Saiu de Configurações para uma
// página própria (decisão AH): é operação de toda semana, tem lixeira e ficha,
// e não é referência que se monta uma vez. O cadastro continua o do catálogo —
// os mesmos botões e frases das abas de Configurações.
const SPECS = [colaborador];

export default function ColaboradoresPage() {
  return <CadastroDoCatalogo titulo="Colaboradores" icone={Contact} specs={SPECS} caminhoDaFicha={caminhoDoColaborador} />;
}
