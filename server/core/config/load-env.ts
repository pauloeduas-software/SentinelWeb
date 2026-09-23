// Carrega o .env ANTES de qualquer leitura de process.env.
//
// Módulo sem nenhum import de propósito: em ESM os módulos são avaliados em
// profundidade, na ordem dos imports. Quem lê variável de ambiente no corpo do
// módulo (o logger lê LOG_LEVEL e NODE_ENV) importa este arquivo na PRIMEIRA
// linha, e assim o .env já está aplicado quando aquele corpo roda.
try {
  process.loadEnvFile();
} catch {
  // Sem .env: vale o que já estiver no ambiente, com os defaults do env.ts.
}
