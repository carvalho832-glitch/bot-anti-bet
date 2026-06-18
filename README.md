# Bot Anti-Bet/Tigrinho para WhatsApp

Bot para grupo do WhatsApp que detecta links de bet, tigrinho, cassino, aposta ou links fora da lista de lojas permitidas. Quando configurado para acao real, ele apaga a mensagem e remove o participante.

Use um numero separado para o bot e coloque esse numero como administrador do grupo.

## Regras principais

- `DRY_RUN=true`: modo teste. O bot detecta, mas nao remove ninguem.
- `DRY_RUN=false`: acao real. O bot apaga a mensagem e remove o participante.
- `STRICT_LINK_MODE=true`: qualquer link fora da lista branca remove o participante.
- `PUNISH_ADMINS=false`: evita remover administradores.

## Instalar localmente

```bash
npm install
npm start
```

Depois escaneie o QR Code com o WhatsApp do numero do bot:

```txt
WhatsApp > Aparelhos conectados > Conectar aparelho
```

Quando conectar, o terminal vai mostrar os IDs dos grupos. Copie o ID do grupo desejado e configure em `GROUP_IDS`.

## Variaveis de ambiente

Copie `.env.example` para `.env` no local, ou configure no Render.

```bash
DRY_RUN=true
MONITOR_ALL_GROUPS=false
GROUP_IDS=120363000000000000@g.us
STRICT_LINK_MODE=true
PUNISH_ADMINS=false
SEND_GROUP_NOTICE=true
SESSION_PATH=./.wwebjs_auth
LOG_DIR=./logs
EXTRA_ALLOWED_DOMAINS=
EXTRA_BANNED_WORDS=
EXTRA_BANNED_DOMAINS=
```

## Render

Para Render, use:

```bash
SESSION_PATH=/data/.wwebjs_auth
LOG_DIR=/data/logs
```

Use Persistent Disk se possivel, porque a sessao do WhatsApp precisa ficar salva entre reinicios.

Primeiro rode com `DRY_RUN=true`. Depois do teste, troque para `DRY_RUN=false`.
