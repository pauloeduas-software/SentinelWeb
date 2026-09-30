import { describe, expect, it } from 'vitest';
import { enderecoInterno, validarDestinoDeWebhook } from '../../server/core/webhook/destino-seguro';

// A ALLOWLIST DE DESTINO DE WEBHOOK — o D126.
//
// ═════════════════════════════════════════════════════════════════════════════
// ESTE É O ÚNICO ARQUIVO DA F8 QUE NÃO FALA COM O BANCO, E É DE PROPÓSITO.
//
// A função é pura, e o que ela protege é a única coisa da fase que um atacante
// alcança: a URL vem do BANCO e a requisição sai do SERVIDOR, de dentro da rede,
// com o que a rede confia nele. É SSRF pelo desenho, não por descuido.
//
// Os dois casos que dão nome à decisão:
//
//   http://169.254.169.254/latest/meta-data/…  → credencial da nuvem, sem auth
//   http://localhost:3001/api/…                → a própria API, por dentro
//
// Um teste que precisasse subir a aplicação para provar isso rodaria devagar e
// seria pulado; assim ele roda em milissegundos e ninguém tem motivo para tirá-lo.
// ═════════════════════════════════════════════════════════════════════════════

describe('o esquema', () => {
  it('aceita https público', () => {
    const destino = validarDestinoDeWebhook('https://hooks.slack.com/services/T000/B000/xxx');
    expect(destino.ok).toBe(true);
  });

  it('recusa http — o conteúdo do alerta vazaria em trânsito', () => {
    const destino = validarDestinoDeWebhook('http://hooks.slack.com/services/T000/B000/xxx');
    expect(destino.ok).toBe(false);
  });

  it('recusa esquemas de escalada clássicos de SSRF', () => {
    for (const url of ['file:///etc/passwd', 'gopher://interno:70/x', 'ftp://interno/x']) {
      expect(validarDestinoDeWebhook(url).ok).toBe(false);
    }
  });

  it('recusa credencial embutida no endereço', () => {
    expect(validarDestinoDeWebhook('https://usuario:senha@hooks.exemplo.com/x').ok).toBe(false);
  });

  it('recusa texto que não é URL', () => {
    expect(validarDestinoDeWebhook('hooks.slack.com/x').ok).toBe(false);
    expect(validarDestinoDeWebhook('   ').ok).toBe(false);
  });
});

describe('o endereço', () => {
  it('recusa o link-local dos metadados de nuvem', () => {
    // O item mais importante da lista e o menos óbvio: é onde AWS, GCP e Azure
    // servem credencial de instância, sem autenticação nenhuma.
    expect(enderecoInterno('169.254.169.254')).toBe(true);
    expect(validarDestinoDeWebhook('https://169.254.169.254/latest/meta-data/').ok).toBe(false);
  });

  it('recusa laço local, privado e CGNAT', () => {
    for (const ip of ['127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.0.10', '100.100.0.1']) {
      expect(enderecoInterno(ip)).toBe(true);
    }
  });

  it('aceita IPv4 público', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.167.0.1']) {
      expect(enderecoInterno(ip)).toBe(false);
    }
  });

  it('recusa IPv6 local e o IPv4 MAPEADO dentro dele', () => {
    expect(enderecoInterno('::1')).toBe(true);
    expect(enderecoInterno('fd00::1')).toBe(true);
    expect(enderecoInterno('fe80::1')).toBe(true);
    // O desvio mais barato da checagem de IPv4: embrulhar o metadado em IPv6.
    expect(enderecoInterno('::ffff:169.254.169.254')).toBe(true);
  });

  it('aceita IPv6 público', () => {
    expect(enderecoInterno('2001:4860:4860::8888')).toBe(false);
  });
});

describe('o nome', () => {
  it('recusa nomes que só existem dentro de uma rede', () => {
    for (const host of ['localhost', 'intranet', 'gitlab', 'srv01', 'painel.internal', 'nas.local', 'metadata.google.internal']) {
      expect(validarDestinoDeWebhook(`https://${host}/x`).ok).toBe(false);
    }
  });

  it('aceita nome público com ponto', () => {
    for (const host of ['hooks.slack.com', 'empresa.webhook.office.com', 'discord.com']) {
      expect(validarDestinoDeWebhook(`https://${host}/x`).ok).toBe(true);
    }
  });
});

describe('a mensagem da recusa', () => {
  it('diz o MOTIVO, porque ela vai para a tela', () => {
    const destino = validarDestinoDeWebhook('http://hooks.slack.com/x');
    expect(destino.ok).toBe(false);
    if (!destino.ok) {
      // "URL inválida" faria a pessoa tentar de novo igual; "somente https é
      // aceito" ensina de uma vez.
      expect(destino.motivo).toContain('https');
    }
  });
});
