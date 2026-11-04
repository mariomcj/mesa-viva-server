# Mesa Viva — servidor

Servidor do Mesa Viva: RPG de mesa com IA como mestre. Node.js com Express, SQLite (better-sqlite3) e WebSocket. A narração é feita por modelos acessados pelo OpenRouter.

```
server.js     Rotas HTTP, login, mesas, jogo, painel admin, WebSocket
regras.js     Motor de regras d20 (fichas, testes, dano, iniciativa, turnos)
mestre.js     Contexto da mesa e chamadas à IA (texto e imagens)
test/         Testes automáticos (npm test), com um Mestre falso que não gasta créditos
public/       Página do jogo, painel admin e APK para download
```

## Configuração (.env)

Crie um arquivo `.env` na pasta do servidor. Ele não vai para o Git.

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | sim | Chave da IA (narração e imagens) |
| `ADMIN_PASS` | para usar o painel | Senha do painel `/admin`. Sem ela o painel fica desligado |
| `ADMIN_USER` | não | Usuário do painel (padrão `admin`) |
| `PUBLIC_BASE_URL` | recomendada | Endereço público, ex.: `https://download.proflow.online` (usado nos links das imagens) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | para login com Google | Credenciais OAuth (tipo "Aplicativo da Web") |
| `GOOGLE_REDIRECT_URI` | não | Padrão `https://download.proflow.online/auth/google/callback` |
| `PORT` | não | Porta (padrão 3062) |
| `DB_PATH` | não | Arquivo do banco (padrão `./mesa-viva.db`) |
| `MODELO_RAPIDO`, `MODELO_CAPRICHADO` | não | Modelos do OpenRouter para cada modo do Mestre |
| `IMAGENS_DE_FUNDO` | não | `0` desliga a imagem de fundo gerada a cada cena nova (economiza créditos) |
| `LIMITE_IA_MAX` | não | Pedidos à IA por conta a cada 10 min (padrão 40) |

## Rodar

```bash
npm install
npm test        # 23 testes: regras, login, segurança, fluxo do jogo e combate
npm start
```

## Como o jogo protege as contas e os créditos

- Toda rota do jogo exige o login (`Authorization: Bearer <token>`). O jogador é identificado pelo **id da conta**.
- O cabeçalho `X-User-Id` (id antigo, gerado no aparelho) não identifica ninguém. Ele só serve para migrar, uma única vez, as mesas e fichas criadas antes do login para a conta (tabela `aparelhos`).
- Só quem é membro de uma mesa pode ler, configurar, salvar ficha, começar, agir ou rolar nela.
- Senhas são guardadas com scrypt. Senhas antigas em texto puro continuam funcionando e são convertidas no próximo login.
- O login vale 90 dias.
- Pedidos à IA têm limite por conta, e só um pedido por mesa de cada vez.

## Atualizar o servidor em produção

1. **Faça backup do banco** (`mesa-viva.db`, `-wal` e `-shm`) e da pasta `public/images`.
2. **Tire as credenciais do Google de dentro do código.** Se você colocou o client id e o secret direto no `server.js` do servidor, passe-os para o `.env` (`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`) e descarte a edição local com `git checkout server.js`. Faça isso antes do `git pull`.
3. **Defina `ADMIN_PASS` no `.env`.** Sem ela, o painel admin fica desligado.
4. **Atualize e reinicie:** `git pull`, depois `npm install` e reinicie o processo.
5. **Publique o APK novo junto.** O app antigo não reconhece a própria ficha com o servidor novo, então todos precisam instalar o APK novo.

As tabelas e colunas novas são criadas sozinhas ao iniciar.
