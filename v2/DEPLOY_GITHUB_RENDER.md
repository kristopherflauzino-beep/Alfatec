# Publicacao do servidor V2 pelo GitHub

O app mobile nao consegue usar `localhost` do proprio aparelho para autenticar.
Por isso, o caminho certo e:

1. Subir este projeto para um repositorio no GitHub.
2. Ligar esse repositorio a um servico web publico no Render.
3. Publicar no GitHub um JSON com a URL publica do servidor.
4. Gerar a APK com `EXPO_PUBLIC_V2_CONFIG_URL` apontando para esse JSON.

## Por que nao usar so GitHub

GitHub sozinho nao executa este backend Node com login, escrita em disco e sincronizacao de dados.
Ele pode guardar o codigo e um arquivo de configuracao publica, mas o servidor precisa rodar em um host HTTP real.

## O que ja ficou pronto no projeto

- `render.yaml` na raiz para publicar o backend a partir do GitHub.
- `v2/backend/server.js` lendo `PORT` para host publico.
- `v2/backend/store.js` lendo `V2_DATA_DIR` para gravar dados em disco persistente.
- `src/v2/licenseClient.js` com suporte a carregar a URL do servidor por um JSON publico.

## Como publicar no Render

1. Envie o projeto para o GitHub.
2. No Render, crie um novo Blueprint/Web Service a partir do repositorio.
3. Use o `render.yaml` da raiz.
4. Mantenha um disco persistente montado em `/var/data`.
5. Depois do deploy, copie a URL publica, por exemplo:
   `https://controle-alfatec-v2.onrender.com`

## Como publicar a configuracao no GitHub

Crie um arquivo JSON publico com este formato:

```json
{
  "apiUrl": "https://controle-alfatec-v2.onrender.com"
}
```

Voce pode usar `v2/mobile-server-config.example.json` como modelo.

Depois publique esse arquivo em um caminho bruto/publico do GitHub e use a URL dele na build da APK:

```powershell
$env:EXPO_PUBLIC_APP_TARGET='v2'
$env:EXPO_PUBLIC_V2_CONFIG_URL='https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPOSITORIO/main/v2/mobile-server-config.json'
```

## Resultado no mobile

Quando a APK abrir:

- Se houver URL salva manualmente, ela continua valendo.
- Se a URL salva for o `localhost` antigo, o app tenta pegar a URL publica no JSON do GitHub.
- Se nao houver configuracao publica, ele continua mostrando a entrada manual.
