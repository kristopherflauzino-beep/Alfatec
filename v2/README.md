# Chamada V2

Esta V2 cria a base de um modelo por assinatura sem mexer no fluxo local da V1.

## O que entrou

- Backend local em `v2/backend/server.js`
- Central admin web em `v2/admin`
- App mobile V2 em `src/v2/AppV2.js`
- Selecao entre V1 e V2 pelo `index.js`

## Credenciais iniciais

- Admin: `admin@alfatec.com` / `admin123`
- Cliente demo: `cliente@alfatec.com` / `demo123`

## Fluxo

1. Abra `Abrir_Admin_V2.bat`.
2. O servidor local da V2 sobe automaticamente e a central do admin abre no navegador.
3. Entre com a conta admin e cadastre clientes.
4. Use a mesma central para pesquisar, editar, bloquear, renovar, redefinir senha e limpar dispositivos.
5. Inicie o app V2 e informe a URL do servidor.

## Entradas de uso

- `Abrir_Admin_V2.bat`: entrada unica do admin. Sobe o servidor e abre a central web.
- `Iniciar_Servidor_V2.bat`: sobe apenas o servidor local da V2.
- `Abrir_App_Android_V2.bat`: inicia o app Android V2.
- `Abrir_App_Desktop_V2.bat`: inicia o app desktop V2 com validacao de licenca.

## Observacoes importantes

- Esta base usa JSON local para desenvolvimento e prova de conceito.
- O app V2 suporta cache offline controlado com tolerancia apos a ultima validacao.
- Para producao, o ideal e trocar o armazenamento por banco de dados e usar HTTPS.

## Painel web no Vercel

- O painel do Controle AlfaTec pode ser publicado pelo GitHub no Vercel usando o diretorio `v2/admin`.
- O passo a passo esta em `v2/DEPLOY_VERCEL_ADMIN.md`.
- O backend da assinatura continua separado e precisa permanecer em um host Node com armazenamento persistente.
