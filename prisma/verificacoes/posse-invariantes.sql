BEGIN;
INSERT INTO users (id,name,email,"createdAt","updatedAt") VALUES
  ('11111111-1111-1111-1111-111111111111','Laura','laura@prova.com',now(),now()),
  ('22222222-2222-2222-2222-222222222222','Ana','ana@prova.com',now(),now());
INSERT INTO locations (id,name,"createdAt","updatedAt") VALUES
  ('33333333-3333-3333-3333-333333333333','Mesa 1 (prova)',now(),now());
INSERT INTO manufacturers (id,name,"createdAt","updatedAt") VALUES ('44444444-4444-4444-4444-444444444444','ACME (prova)',now(),now());
INSERT INTO categories (id,name,type,"createdAt","updatedAt") VALUES ('55555555-5555-5555-5555-555555555555','Periférico (prova)','ASSET',now(),now());
INSERT INTO asset_models (id,name,"manufacturerId","categoryId","createdAt","updatedAt") VALUES ('66666666-6666-6666-6666-666666666666','Mouse X','44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',now(),now());
INSERT INTO assets (id,"assetTag","statusId","modelId","createdAt","updatedAt") VALUES
  ('77777777-7777-7777-7777-777777777777','ATV-PROVA',(SELECT id FROM status_labels WHERE type='DEPLOYABLE' LIMIT 1),'66666666-6666-6666-6666-666666666666',now(),now());

\echo ''
\echo '### 1. Laura(manha) + Ana(tarde) na Mesa 1  -> esperado: PASSA'
SAVEPOINT s1;
INSERT INTO location_occupants (id,"locationId","userId",shift,"startedAt","createdAt","updatedAt") VALUES
  (gen_random_uuid(),'33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Manhã',now(),now(),now()),
  (gen_random_uuid(),'33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Tarde',now(),now(),now());

\echo ''
\echo '### 2. Laura DE NOVO na Mesa 1 (ocupacao ja aberta)  -> esperado: FALHA'
SAVEPOINT s2;
INSERT INTO location_occupants (id,"locationId","userId",shift,"startedAt","createdAt","updatedAt") VALUES
  (gen_random_uuid(),'33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Noite',now(),now(),now());
ROLLBACK TO s2;

\echo ''
\echo '### 3. Mouse entregue a Mesa 1  -> esperado: PASSA'
SAVEPOINT s3;
INSERT INTO assignments (id,"assetId","targetType","targetLocationId","checkoutAt","createdAt","updatedAt") VALUES
  (gen_random_uuid(),'77777777-7777-7777-7777-777777777777','LOCATION','33333333-3333-3333-3333-333333333333',now(),now(),now());

\echo ''
\echo '### 4. Mesmo mouse entregue a Laura sem devolver  -> esperado: FALHA (duplo checkout)'
SAVEPOINT s4;
INSERT INTO assignments (id,"assetId","targetType","targetUserId","checkoutAt","createdAt","updatedAt") VALUES
  (gen_random_uuid(),'77777777-7777-7777-7777-777777777777','USER','11111111-1111-1111-1111-111111111111',now(),now(),now());
ROLLBACK TO s4;

\echo ''
\echo '### 5. Camada 3 — quem responde pelo mouse?  -> esperado: Ana/Tarde + Laura/Manha'
SELECT u.name AS responsavel, o.shift AS turno, l.name AS posto
FROM assignments a
JOIN locations l ON l.id = a."targetLocationId"
JOIN location_occupants o ON o."locationId" = l.id AND o."endedAt" IS NULL
JOIN users u ON u.id = o."userId"
WHERE a."assetId"='77777777-7777-7777-7777-777777777777' AND a."checkinAt" IS NULL
ORDER BY u.name;

\echo ''
\echo '### 6. Depois da devolucao, entregar de novo  -> esperado: PASSA'
UPDATE assignments SET "checkinAt"=now() WHERE "assetId"='77777777-7777-7777-7777-777777777777' AND "checkinAt" IS NULL;
INSERT INTO assignments (id,"assetId","targetType","targetUserId","checkoutAt","createdAt","updatedAt") VALUES
  (gen_random_uuid(),'77777777-7777-7777-7777-777777777777','USER','11111111-1111-1111-1111-111111111111',now(),now(),now());

\echo ''
\echo '### 7. Historico preservado (checkin nao apaga linha)  -> esperado: 2 linhas, 1 fechada'
SELECT "targetType", ("checkinAt" IS NULL) AS aberta FROM assignments WHERE "assetId"='77777777-7777-7777-7777-777777777777' ORDER BY "checkoutAt";
ROLLBACK;
