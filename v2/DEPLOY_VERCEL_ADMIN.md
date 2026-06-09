# Deploy do Controle AlfaTec no Vercel

Este deploy publica somente o painel web do Controle AlfaTec.

O backend V2 atual continua precisando de um host Node com disco persistente, porque ele grava dados em `store.json` e salva arquivos enviados pelos clientes. Por isso:

- `Vercel`: painel web `v2/admin`
- `Render` ou outro host Node: backend `v2/backend`

## O que ja ficou ajustado

- O HTML do painel nao depende mais do caminho `/admin/`.
- O diretorio `v2/admin` agora tem um `vercel.json`.
- Esse `vercel.json` faz proxy de `/api/*` para:
  `https://controle-alfatec-v2.onrender.com/api/*`

Assim, o painel web hospedado no Vercel continua chamando `/api/...` como se fosse local, mas o trafego vai para o backend publico.

## Como subir pelo GitHub

1. Envie este projeto para o repositorio:
   `kristopherflauzino-beep/Alfatec`
2. No Vercel, importe esse repositorio do GitHub.
3. Em `Root Directory`, escolha:
   `v2/admin`
4. Em `Framework Preset`, use:
   `Other`
5. Finalize o deploy.

## Resultado esperado

- A pagina principal do Vercel abre o painel do Controle AlfaTec.
- Login, listagem de clientes, usuarios, dispositivos e arquivos continuam usando o backend publico.
- Downloads e uploads passam pelo mesmo caminho `/api/...` no dominio do Vercel.

## Quando trocar a URL do backend

Se o backend publico mudar de dominio, altere este arquivo:

`v2/admin/vercel.json`

Troque a linha do `destination` para a nova URL publica:

```json
{
  "source": "/api/:path*",
  "destination": "https://SEU-NOVO-BACKEND/api/:path*"
}
```

Depois disso, redeploy no Vercel.

## Importante

Se voce quiser mover tambem o backend para Vercel no futuro, sera preciso antes trocar:

- `store.json` por banco real
- uploads locais por armazenamento externo

Do jeito atual, o backend V2 nao deve ser hospedado como servidor definitivo no Vercel.
