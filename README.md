# AlfaTec

Projeto principal do `APP De chamada` com a estrutura V2 de licenca, painel de controle e apps cliente.

## Estrutura do repositorio

### App mobile e frontend principal

- `App.js`
  app principal da chamada
- `src/`
  componentes e a versao V2
- `src/v2/AppV2.js`
  app mobile com login por licenca
- `assets/`
  logos, icones e imagens usadas no app

### Painel controle

- `v2/admin/`
  painel web do `Controle AlfaTec`
- `v2/admin/vercel.json`
  configuracao pronta para deploy do painel no Vercel
- `v2/DEPLOY_VERCEL_ADMIN.md`
  passo a passo do GitHub + Vercel

### Backend V2

- `v2/backend/server.js`
  API de login, licenca, clientes, usuarios e arquivos
- `v2/backend/store.js`
  persistencia local atual da V2
- `render.yaml`
  deploy do backend em host Node publico

### Configuracao publica do mobile

- `docs/v2/mobile-server-config.json`
  arquivo publico para o app mobile localizar o backend oficial
- `v2/mobile-server-config.json`
  referencia local da mesma configuracao

## Como subir no GitHub

Suba principalmente estas pastas e arquivos:

- `assets/`
- `scripts/`
- `src/`
- `v2/`
- `docs/`
- `App.js`
- `app.json`
- `package.json`
- `package-lock.json`
- `index.js`
- `render.yaml`
- `.gitignore`
- `README.md`

Arquivos locais, builds e dados de teste ja ficam fora pelo `.gitignore`.

## Como publicar o painel no Vercel

1. Envie este repositorio para o GitHub.
2. No Vercel, importe o repositorio.
3. Em `Root Directory`, use `v2/admin`.
4. Em `Framework Preset`, use `Other`.
5. Faca o deploy.

O painel web ja esta preparado para usar o `vercel.json` dentro de `v2/admin`.

## Como publicar o backend

O backend atual nao deve ficar como servidor definitivo dentro do Vercel porque ele grava:

- dados em `store.json`
- uploads em disco local

Para o backend, use um host Node com armazenamento persistente, como o fluxo ja preparado em:

- `render.yaml`
- `v2/DEPLOY_GITHUB_RENDER.md`

## Login inicial da V2

- `admin@alfatec.com`
- senha inicial: `admin123`
