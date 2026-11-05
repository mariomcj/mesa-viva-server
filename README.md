# Mesa Viva — servidor

Servidor do Mesa Viva: RPG de mesa com IA como mestre. Node.js com Express, SQLite (better-sqlite3) e WebSocket. A narração é feita por modelos acessados pelo OpenRouter.

```
server.js     Rotas HTTP, login, mesas, jogo, painel admin, WebSocket
regras.js     Motor de regras d20 (fichas, testes, dano, iniciativa, turnos)
mestre.js     Contexto da mesa, arco da história e chamadas à IA (texto e imagens)
temas.js      Os 20 temas da história, o tema "Surpresa" e as durações da aventura
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
| `QUALIDADE_ARCO` | não | `rapido` usa o modelo rápido para criar o arco da história (padrão: o caprichado, uma chamada por aventura) |
| `IMAGENS_DE_FUNDO` | não | `0` desliga a imagem de fundo gerada a cada cena nova (economiza créditos) |
| `LIMITE_IA_MAX` | não | Pedidos à IA por conta a cada 10 min (padrão 40) |

## Rodar

```bash
npm install
npm test        # 41 testes: regras, login, segurança, fluxo do jogo, combate, temas e arco da história
npm start
```

## Temas e arco da história

Ao criar a mesa, o grupo escolhe um **tema** (ou "Surpresa", que o servidor sorteia e grava) e a **duração**: "Uma noite" (cerca de 2 horas) ou "Campanha" (vários encontros). Tema e duração só mudam no saguão, antes de começar.

Temas: Fantasia Clássica, Escola de Magia, A Grande Jornada, Tronos e Traições, Horror Cósmico, Mares de Piratas, Faroeste Sobrenatural, Neon e Cromo, Ópera Espacial, Terra Devastada, Londres a Vapor, Heróis do Olimpo, Saga Viking, Era dos Samurais, Lendas do Brasil, Mistério na Mansão, Os Últimos de Pé, Heróis Mascarados, Contos Sombrios e Távola Redonda. Cada um tem ambientação, um jeito de reinterpretar raças, classes e magias (a mecânica não muda), um estilo de imagem e uma lista de "sementes" sorteadas para variar a história. Temas inspirados em obras protegidas usam mundo, nomes e personagens originais; só obras em domínio público usam figuras canônicas.

Ao começar a aventura, a IA cria o **arco**: título, vilão, 3 atos (objetivo público, segredo e cenas sugeridas) e desfechos possíveis, a partir do tema, da duração, das fichas, do tom, dos vetos e do "rumo da história" pedido pelo grupo. Se a criação falhar, o clássico usa "A Mina de Pedra-Funda" e os outros temas, um arco mínimo de improviso. Durante o jogo o Mestre avança os atos (um por vez), registra ajustes causados pelas escolhas do grupo e encerra a história no ato 3. O app só recebe a parte pública do arco (título, ato, nome e objetivo do ato, concluído).

| Rota | O que faz |
| --- | --- |
| `GET /api/temas` | Lista de temas (com "Surpresa" primeiro) e de durações |
| `POST /api/mesa/criar` | Aceita `tema` e `duracao` (inválidos viram `classico` e `curta`) |
| `POST /api/configurar-mesa` | Aceita `tema` e `duracao` (só no saguão; depois, 409) e `desejos` (rumo da história, 300 caracteres, em qualquer fase) |
| `GET /api/mesa/:codigo` | Estado da mesa com `tema`, `temaNome`, `temaInspiracao`, `temaIcone`, `duracao`, `desejos` e `arco` público |
| `GET /api/user/mesas` | Cada mesa com `tema`, `temaNome`, `temaIcone` e `titulo` da história |
| `POST /api/reiniciar-mesa` | Volta ao saguão e apaga o arco; tema, duração e rumo da história ficam |
| `POST /api/criar-personagem` | Usa o tema da mesa se vier `codigo` (ou o `tema` do corpo) |

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
