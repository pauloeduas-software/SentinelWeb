import { describe, expect, it } from 'vitest';
import type { Entry } from 'ldapts';
import { traduzirEntradaDoDiretorio } from '../../server/domain/access/use-cases/sync-ldap.usecase';

// A TRADUÇÃO DO QUE O DIRETÓRIO DEVOLVE (F11, Etapa I).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ESTE ARQUIVO É `.puro` E NÃO FALA COM BANCO NENHUM.
//
// A sincronização inteira precisa de um controlador de domínio de pé — e montar um
// servidor LDAP falso dentro da suíte seria testar o servidor falso. O que dá para
// provar sem rede é justamente onde os defeitos moram: QUAL atributo vira e-mail,
// o que fazer com um GUID que chega em bytes, e o que é descartado em silêncio.
//
// Cada caso aqui corresponde a uma decisão escrita no use-case, e é isso que
// impede a decisão de ser desfeita por acidente — um `mail` trocado por
// `userPrincipalName` passaria por qualquer revisão e produziria endereços
// `f.silva@tenant.onmicrosoft.com` em todo e-mail de atraso.
// ═════════════════════════════════════════════════════════════════════════════

/** Uma entrada do jeito que a `ldapts` a entrega: valores soltos ou em array. */
function entrada(campos: Record<string, unknown>): Entry {
  return { dn: 'CN=Fulano,OU=Pessoas,DC=empresa,DC=local', ...campos } as unknown as Entry;
}

describe('o identificador estável', () => {
  it('prefere o `objectGUID` do AD, em hexadecimal', () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    const pessoa = traduzirEntradaDoDiretorio(entrada({
      objectGUID: bytes, mail: 'ana@empresa.local', displayName: 'Ana Lima',
    }));

    // `guid:` + hex. O formato não tenta remontar a ordem mista do GUID da
    // Microsoft de propósito: o valor só precisa ser ESTÁVEL e único, e
    // reinterpretá-lo criaria um segundo formato para o mesmo dado.
    expect(pessoa?.externalId).toBe('guid:deadbeef');
  });

  it('cai no `entryUUID` do OpenLDAP quando não há GUID', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'AB-CD', mail: 'ana@empresa.local', cn: 'Ana Lima',
    }));

    // Minúsculo: o mesmo UUID em caixa diferente é o mesmo UUID, e sem normalizar
    // ele viraria duas pessoas no primeiro diretório que muda a caixa.
    expect(pessoa?.externalId).toBe('uuid:ab-cd');
  });

  it('usa a DN como último recurso', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      mail: 'ana@empresa.local', cn: 'Ana Lima',
    }));

    expect(pessoa?.externalId).toBe('dn:cn=fulano,ou=pessoas,dc=empresa,dc=local');
  });
});

describe('o que vira e-mail e nome', () => {
  it('`mail` ganha de `userPrincipalName`', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1',
      mail: 'ana.lima@empresa.com.br',
      userPrincipalName: 'a.lima@tenant.onmicrosoft.com',
      displayName: 'Ana Lima',
    }));

    // O UPN é o LOGIN e costuma ser um endereço que ninguém lê. Ele é o recurso,
    // não a preferência: o sistema manda e-mail de atraso e termo de aceite para
    // este endereço.
    expect(pessoa?.email).toBe('ana.lima@empresa.com.br');
  });

  it('o UPN serve quando não há `mail`', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', userPrincipalName: 'A.Lima@Empresa.com', cn: 'Ana' ,
    }));

    // Minúsculo: `email` tem índice único parcial no banco, e `A.Lima@` contra
    // `a.lima@` seriam duas pessoas.
    expect(pessoa?.email).toBe('a.lima@empresa.com');
  });

  it('`displayName` ganha de `cn`', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', mail: 'ana@empresa.local', displayName: 'Ana Lima', cn: 'ALIMA',
    }));

    expect(pessoa?.name).toBe('Ana Lima');
  });

  it('array de valores: o primeiro vale', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', mail: ['ana@empresa.local', 'antigo@empresa.local'], cn: ['Ana Lima'],
    }));

    expect(pessoa?.email).toBe('ana@empresa.local');
    expect(pessoa?.name).toBe('Ana Lima');
  });
});

describe('o que é descartado — e por que não é erro', () => {
  it('sem e-mail, a entrada não entra', () => {
    // É o caso das contas de serviço e dos objetos de computador que escapam de um
    // filtro largo. Sem e-mail não há como avisar ninguém de nada — e inventar um
    // a partir do `cn` criaria cadastro fantasma recebendo equipamento.
    expect(traduzirEntradaDoDiretorio(entrada({ entryUUID: 'u1', cn: 'svc-backup' }))).toBeNull();
  });

  it('sem nome, a entrada não entra', () => {
    expect(traduzirEntradaDoDiretorio(entrada({ entryUUID: 'u1', mail: 'x@empresa.local' }))).toBeNull();
  });

  it('string vazia conta como ausente', () => {
    // O AD devolve atributo vazio com frequência. Sem este cuidado, a pessoa
    // entraria com `name: ''` e a listagem mostraria uma linha em branco clicável.
    expect(traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', mail: '  ', displayName: 'Ana',
    }))).toBeNull();
  });
});

describe('os campos opcionais', () => {
  it('matrícula, cargo e telefone vêm quando existem', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', mail: 'ana@empresa.local', displayName: 'Ana Lima',
      employeeID: '  12345 ', title: 'Analista de Suporte', telephoneNumber: '+55 11 99999-0000',
    }));

    // `trim` em tudo: matrícula com espaço na ponta viraria uma matrícula
    // diferente da digitada à mão aqui, e o índice único não as uniria.
    expect(pessoa?.employeeNumber).toBe('12345');
    expect(pessoa?.jobTitle).toBe('Analista de Suporte');
    expect(pessoa?.phone).toBe('+55 11 99999-0000');
  });

  it('`mobile` serve quando não há `telephoneNumber`', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', mail: 'ana@empresa.local', displayName: 'Ana', mobile: '11 98888-7777',
    }));

    expect(pessoa?.phone).toBe('11 98888-7777');
  });

  it('ausentes viram `null`, não string vazia', () => {
    const pessoa = traduzirEntradaDoDiretorio(entrada({
      entryUUID: 'u1', mail: 'ana@empresa.local', displayName: 'Ana',
    }));

    // `null` e não `''` porque o use-case só sobrescreve o que TEM valor: um
    // `title` vazio no diretório não pode apagar o cargo que alguém preencheu à
    // mão aqui, e `''` seria um valor.
    expect(pessoa).toMatchObject({ employeeNumber: null, jobTitle: null, phone: null });
  });
});
