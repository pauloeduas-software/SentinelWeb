import type { FastifyInstance } from 'fastify';
import { assetController } from './controllers/asset.controller';
import { createLogger } from '../../core/logger/logger';
import { EXPORT_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('asset.maestro');

// O ativo do ITAM — o `Asset` do vocabulário do Snipe-IT.
//
// A máquina descoberta pelo agente é o `Endpoint`, em /api/endpoints: são duas
// coisas diferentes de propósito, porque há ativo sem agente (monitor, cadeira,
// cabo) e máquina vista pelo agente que ninguém cadastrou. O vínculo entre as
// duas é a Fase 7.
export class AssetMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/assets', assetController.list);
    server.get('/api/assets/stats', assetController.stats);
    // Lista enxuta para o `<select>` da aba "Ativo" do modal de entrega: é assim
    // que se prende um periférico a outro equipamento (docs/MODELO-POSSE.md).
    server.get('/api/assets/options', assetController.options);

    // O EXPORT (F10, Etapa C). ANTES de `/api/assets/:id` como as outras rotas
    // de segmento fixo — o find-my-way casa o estático primeiro, mas a ordem
    // aqui é o que mantém o arquivo legível.
    //
    // Teto PRÓPRIO (`EXPORT_RATE_LIMIT`, 10/min): cada chamada varre a tabela
    // inteira com cursor, e o teto global de 300/min permitiria trezentas
    // varreduras por minuto — negação de serviço acidental com dois cliques.
    server.get('/api/assets/export', EXPORT_RATE_LIMIT, assetController.export);

    // A BUSCA DO LEITOR DE CÓDIGO DE BARRAS (F10, Etapa G).
    //
    // A ROTA É GLOBAL (`/api/search`) e o handler é do ativo: é ativo que ela
    // procura. A ordem das tentativas — etiqueta exata, série exata e só então
    // `ILIKE` — está no use-case, e ela sai dos índices: os dois primeiros usam
    // índice único parcial, o terceiro varre a tabela.
    //
    // SEM teto próprio: quem bipa cinquenta equipamentos em sequência faz
    // cinquenta buscas em dois minutos, e o teto global de 300/min cobre isso
    // com folga. Um teto apertado aqui atrapalharia exatamente o uso para o
    // qual a rota existe.
    server.get('/api/search', assetController.search);

    // A LISTA BIPADA — uma pergunta só para as 24 etiquetas de uma folha
    // (F10, Etapa G). `POST` porque a entrada é um array; nada grava.
    server.post('/api/assets/resolve-tags', assetController.resolveTags);
    // Match exato para leitor de código de barras. **Não é o caminho da
    // reconciliação da F7**, como esta linha dizia antes: a cascata de matching
    // carrega os candidatos e compara em memória, porque ela precisa detectar
    // COLISÃO (serial que casa com dois ativos vale zero, D46) e uma rota que
    // devolve um ativo por serial não tem como responder isso.
    server.get('/api/assets/by-serial/:serial', assetController.bySerial);
    // O CONJUNTO DE CAMPOS CUSTOMIZADOS do modelo escolhido (F9, D58). Caminho
    // fixo, e por isso ANTES de `/:id` — ela não é a leitura de um ativo: o
    // formulário a chama no cadastro, quando ativo nenhum existe ainda.
    server.get('/api/assets/fieldset', assetController.fieldset);

    // A leitura unitária vem DEPOIS das rotas de caminho fixo (`/stats`,
    // `/options`, `/by-serial`): o find-my-way casa o segmento estático antes do
    // parâmetro, mas manter a ordem aqui é o que deixa isso óbvio para quem
    // acrescentar a próxima.
    //
    // É a rota que a tela de detalhe (/ativos/:id) começa fazendo: uma URL
    // colada no navegador não tem a linha que a listagem tinha em memória.
    server.get('/api/assets/:id', assetController.byId);

    // A aba Histórico: o `ActivityLog` do ativo unido ao histórico de posse, do
    // mais recente para o mais antigo. NÃO existe tabela `AssetLog` (D18).
    server.get('/api/assets/:id/history', assetController.history);

    // REVELAR um campo customizado cifrado (F9, D62). A ÚNICA porta por onde o
    // valor em claro sai: toda outra leitura devolve `••••••`.
    //
    // GET que ESCREVE `ActivityLog`, como o `/product-key` da F6 — e com o teto
    // de escrita por isso mesmo: é a rota que um script tentaria em laço para
    // varrer segredos, e cada tentativa custa uma linha de auditoria.
    server.get(
      '/api/assets/:id/custom-fields/:slug/reveal',
      WRITE_RATE_LIMIT,
      assetController.revealCustomField,
    );

    server.post('/api/assets', WRITE_RATE_LIMIT, assetController.create);
    server.put('/api/assets/:id', WRITE_RATE_LIMIT, assetController.update);
    server.delete('/api/assets/:id', WRITE_RATE_LIMIT, assetController.remove);
    // Restaurar da lixeira: POST porque muda estado e cada restauração vira uma
    // linha no ActivityLog.
    server.post('/api/assets/:id/restore', WRITE_RATE_LIMIT, assetController.restore);

    // DESCOMISSIONAR: o ativo saiu do PATRIMÔNIO (vendido, descartado,
    // roubado). Não é arquivar (`status.type = ARCHIVED`) nem apagar
    // (`deletedAt`) — são três colunas com três significados, e nenhuma
    // substitui a outra (D19). POST porque muda estado e deixa histórico.
    server.post('/api/assets/:id/retire', WRITE_RATE_LIMIT, assetController.retire);
    server.post('/api/assets/:id/unretire', WRITE_RATE_LIMIT, assetController.unretire);

    // AÇÃO EM MASSA: uma operação declarada, N ativos, tudo ou nada (D21).
    // Caminho fixo `/bulk` e não `/:id/...` — o lote não é operação de UM ativo.
    server.post('/api/assets/bulk', WRITE_RATE_LIMIT, assetController.bulk);

    logger.info('[Maestro] Rotas de Ativos (ITAM) inicializadas.');
  }
}
