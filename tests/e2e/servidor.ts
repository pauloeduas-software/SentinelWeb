import { buildApp } from '../../server/app';
import { getPort, validateEnv } from '../../server/infra/config/env';

// O SERVIDOR DO E2E: o mesmo `buildApp` de produção, com o teto ligado e mais alto.
//
// O teto por IP conta o build também, e cada teste é um navegador sem cache: a
// suíte inteira vem de um IP só, e passou de 300 por minuto. Estourado, a página
// abre em branco, e o teste falha por um motivo que não é dele. É o limite, e não o
// teste, que muda aqui: os tetos por rota continuam os de produção, e quem prova o
// 429 é `tests/invariantes/teto-de-requisicao.test.ts`. Sem os jobs do `server.ts`:
// nenhum spec depende deles.
const TETO_DO_E2E = 3000;

validateEnv();
const server = await buildApp({ tetoPorMinuto: TETO_DO_E2E });
await server.listen({ port: getPort(), host: '0.0.0.0' });
