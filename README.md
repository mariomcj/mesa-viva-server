# Mesa Viva — servidor

Servidor do Mesa Viva: RPG de mesa com IA como mestre. Node.js com Express, SQLite (better-sqlite3) e WebSocket. A narração é feita por modelos acessados pelo OpenRouter.

```
server.js     Rotas HTTP, login, mesas, jogo, painel admin, WebSocket
regras.js     Motor de regras d20 (fichas, mana, inventário, evolução, testes, dano, iniciativa, turnos)
catalogo.js   Catálogo de magias (Mago e Clérigo, truques ao 5º círculo) e técnicas de combate (Guerreiro e Ladino)
mapa.js       Mapa de batalha visto de cima: grade, terreno, caminhos, linha de visão, posições e movimento dos inimigos (lógica pura)
mestre.js     Contexto da mesa, arco da história e chamadas à IA (texto e imagens)
temas.js      Os 20 temas da história, o tema "Surpresa" e as durações da aventura
nomes-temas.js Nomes do tema: como raças, classes, magias e técnicas aparecem em cada tema (só exibição)
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
| `XP_POR_ACAO` | não | XP por ação narrada. Padrão `5`; `2` deixa a subida de nível mais lenta (recomendado em produção) |
| `XP_POR_ATO`, `XP_POR_FIM` | não | XP que todos ganham quando o ato vira (padrão `40`) e quando a história termina (padrão `60`); `0` desliga |
| `CHANCE_VISIVEL` | não | `1` mostra a chance de sucesso no texto de cada rolagem, quando a mesa mostra a dificuldade |
| `FUGA_DE_INIMIGOS` | não | `0` impede inimigos muito feridos de fugir |
| `ENCONTROS_DE_ESTRADA` | não | `0` desliga as sementes de encontro entre cenas |
| `REAPROVEITAR_FUNDOS` | não | `0` gera sempre uma imagem nova; `exato` só reaproveita o fundo da mesma cena (padrão: mesma cena e mesmo tipo de lugar) |
| `IMAGENS_DE_MAPA` | não | `0` desliga a imagem do mapa de batalha gerada a cada combate novo (economiza créditos; o app desenha um tabuleiro no lugar) |
| `LIMITE_IA_MAX` | não | Pedidos à IA por conta a cada 10 min (padrão 40) |

## Rodar

```bash
npm install
npm test        # 78 testes: regras, login, segurança, fluxo do jogo, combate, mapa de batalha, temas, arco, turno em etapas, magias, inventário, dia e evolução
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
| `GET /api/mesa/:codigo` | Estado da mesa com `tema`, `temaNome`, `temaInspiracao`, `temaIcone`, `duracao`, `desejos`, `arco` público e `nomes` (nomes do tema para raças, classes, magias, técnicas e o rótulo da mana; mesa sem tema = clássico). Rotas e ficha continuam com os nomes mecânicos |
| `GET /api/user/mesas` | Cada mesa com `tema`, `temaNome`, `temaIcone` e `titulo` da história |
| `POST /api/reiniciar-mesa` | Volta ao saguão e apaga o arco; tema, duração e rumo da história ficam |
| `POST /api/criar-personagem` | Usa o tema da mesa se vier `codigo` (ou o `tema` do corpo) |

## Mapa de batalha

Quando um combate começa, a IA manda, junto dos inimigos, o mapa visto de cima: uma grade de `colunas` × `linhas` casas (cada casa = 1,5 m; padrão 10 × 14, de 8×10 a 12×16), o terreno em retângulos e a casa de cada figura. O servidor confere e corrige tudo (limites, tipos, retângulos dentro da grade, no máximo 35% de terreno, ninguém isolado, posições livres e sem sobreposição) e coloca automaticamente quem ficou sem casa: jogadores nas 2 últimas linhas, inimigos nas 3 primeiras. Sem mapa da IA, monta um campo aberto com 2 a 4 obstáculos ou coberturas.

- Terreno: `obstaculo` (bloqueia passagem e visão), `cobertura` (custa 2; +2 de CA contra ataques à distância para quem está nela ou logo atrás), `dificil` e `agua` (custam 2 para entrar), `abismo` (bloqueia).
- Distância de Chebyshev (diagonal custa 1). Deslocamento: 6 casas por turno (Anão e Halfling, 5), em quantas etapas quiser; zera quando a vez passa. Atravessa aliados, nunca inimigos; não termina em casa ocupada.
- Ataques: corpo a corpo só contra quem está ao lado (o personagem avança sozinho até o alvo se o deslocamento der; senão o ataque é cancelado e a vez continua); à distância até 12 casas e com linha de visão. O alcance vem do campo `alcance` do ataque ou de palavras do nome (arco, besta, pistola, raio, magia…).
- Inimigos: os corpo a corpo andam até 6 casas rumo ao personagem mais próximo e só atacam se terminarem ao lado; os de longe se reposicionam para ter linha de visão e atiram no mais próximo.
- A imagem do mapa é gerada em segundo plano (como a do fundo) e só é gravada se ainda for o mesmo combate.
- Combates antigos, sem mapa, continuam funcionando como antes.

O estado da mesa (`GET /api/mesa/:codigo`) traz em `combate`: `mapa` (`colunas`, `linhas`, `descricao`, `terreno`, `imagem`), `posicoes` (`{id: {x, y}}`) e `deslocamento` (`{id: {total, usado}}`); cada inimigo ganha `alcance`.

| Rota | O que faz |
| --- | --- |
| `POST /api/mover` | `{codigo, x, y}`: move a própria ficha na sua vez (sem pausa nem rolagem pendente, personagem de pé), pelo caminho mais curto, até o deslocamento restante. Responde `{ok, posicao, restante}`; erros 409 com a mensagem ("Não é a sua vez.", "O combate está pausado.", "Longe demais: você ainda tem N casas de deslocamento.", "Essa casa está ocupada.", "Não dá para passar por ali.") |

## Turno em etapas, magias, inventário, dia e evolução

- **Turno do jogador no combate** (inimigos como antes): 1) mover (`/api/mover`, só antes da ação); 2) uma ação — ataque ou magia da ficha (`/api/acao-combate`) ou ação livre em texto (`/api/agir`, julgada pelo Mestre); 3) um item rápido (`/api/usar-item`, antes ou depois da ação). O estado público fica em `combate.turno = {id, acaoUsada, itemUsado}`. O turno acaba sozinho quando a ação foi feita e o item também (ou não há poção/item rápido no inventário), com `/api/encerrar-turno`, ou pelos 10 min sem jogar. Só mover não encerra.
- **Lista fechada**: só ataques e magias da ficha. Teste de "ataque" do Mestre com nome fora da ficha vira aviso, sem rolagem e sem gastar a ação. Fora de alcance (mapa) também não gasta a ação.
- **Mana**: Mago (INT) e Clérigo (SAB) têm `manaMax = max(2, 2 + 2×nível + mod)`; truque custa 0, círculo N custa N+1; círculo máximo `min(5, ⌈nível/2⌉)`. Magia de dano rola ataque (proficiência + mod; dano sem atributo); cura e utilidade se resolvem na hora e o Mestre narra numa frase. Fora de combate, cura e utilidade por `/api/usar-magia`.
- **Inventário** `[{nome, qtd, tipo: pocao|rapido|equipamento|municao|outro, efeito, descricao}]` (até 30). O servidor aplica `cura NdM+K`; outros itens rápidos são gastos e narrados. O Mestre dá e tira itens com `itens` (qtd 1–10, efeito só `cura NdM+K`). `equipamento` vira uma lista derivada, para apps antigos.
- **Dia**: `mesa.dia` começa em 1. Com `novo_dia` do Mestre (só fora de combate, nunca duas vezes seguidas sem narração no meio), todos voltam com vida e mana cheias.
- **Evolução**: ao subir de nível (até o 20), a ficha ganha `pendencias` com as opções prontas — `pontos` (+2 nos níveis 4, 8, 12, 16, 19; máx. 20 por atributo), `magias` (Mago +2, Clérigo +1 por nível) e `ataques` (técnicas de Guerreiro e Ladino nos níveis 2, 3, 5, 7… 19) — resolvidas por `/api/evoluir`, também em partes.
- **Ficha travada**: depois de começar, `/api/salvar-ficha` só muda `nome`, `sexo`, `imagem`, `tracos`, `anotacoes` (ou `notas`) e `antecedente`. No saguão, inventário e magias só vêm da ficha criada pelo Mestre (ou do catálogo de nível 1 da classe); vida e mana ficam cheias.
- **Fichas e mesas antigas** são convertidas na leitura, sem migração: `equipamento` vira itens (mais 2 Poções de cura, uma vez), magias `{nome, descricao}` são procuradas no catálogo (senão viram utilidade de 1º círculo), ataques ganham `alcance`, mesa sem dia fica no dia 1, combate sem `turno` ganha um.

| Rota | O que faz |
| --- | --- |
| `POST /api/acao-combate` | `{codigo, tipo: "ataque"\|"magia", nome, alvo}`: a ação do turno. Ataque e magia de dano respondem `{ok, rolagem}` (role com `/api/rolar`); cura responde `{ok, cura}`; utilidade `{ok}`. 409: "Esse ataque não está na sua ficha.", "Essa magia não está na sua ficha.", "Mana insuficiente: Bola de Fogo custa 4 e você tem 2.", "Você já fez sua ação neste turno.", fora de alcance / sem linha de visão |
| `POST /api/usar-item` | `{codigo, item, alvo?}`: poção ou item rápido; no combate, na própria vez e um por turno; em aliado só ao lado (no mapa). `{ok, cura?}` |
| `POST /api/usar-magia` | `{codigo, nome, alvo?}`: cura ou utilidade fora de combate |
| `POST /api/encerrar-turno` | `{codigo}`: encerra a própria vez |
| `POST /api/evoluir` | `{codigo, atributos: {"for":1,"con":1}, magias: [nomes], ataques: [nomes]}`: resolve pendências (parcial vale). `{ok, ficha}` |

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

## Idioma da narração

- Coluna `mesas.idioma` (`pt` ou `en`, padrão `pt`): a língua em que o Mestre escreve nessa mesa. A mesa nasce com o idioma do aparelho de quem a criou (cabeçalho `X-Idioma`) e pode ser trocada em Ajustes (`POST /api/configurar-mesa` com `idioma`), em qualquer fase.
- Em português nenhum prompt muda. Em inglês, `blocoIdioma` (em `mestre.js`) acrescenta ao fim dos prompts de narração, de arco e de criação de ficha a instrução de escrever em inglês, sem traduzir ids, chaves do JSON nem nomes de perícias, raças, classes, ataques e magias.
- Continuam só em português: as mensagens de erro, as mensagens de sistema do diário (o app lê algumas delas) e o catálogo de temas.

## Aventuras, ouro, saque, loja e crônica

Tudo aqui é acréscimo: sem usar, o jogo se comporta como antes.

- **Aventuras** (`aventuras.js`): 4 por tema. A escolhida (`mesas.aventura`) entra como elemento-semente do arco e dá o título. `GET /api/aventuras`; `POST /api/mesa/criar` e `/api/configurar-mesa` aceitam `aventura` (só no saguão).
- **Ouro e saque** (`novidades.js`): na vitória, cada personagem de pé ganha ouro e 3 opções de saque com raridade (poção, bolsa de ouro e tônico de mana ou relíquia). `POST /api/saque` com `indice` fica com uma. A ficha ganha `ouro` e os itens, `raridade`.
- **Loja da vila**: `GET /api/mesa/:codigo/loja`, `POST /api/loja/comprar` (`id` de um item ou `estalagem`) e `POST /api/loja/vender`. Só fora de combate.
- **Descanso curto**: `POST /api/descanso-curto`, uma vez por ato, recupera metade da vida e da mana.
- **Crônica**: `GET /api/mesa/:codigo/cronica` devolve os marcos da campanha (tirados do diário), o bestiário, os pontos de salvamento e o epílogo.
- **Pontos de salvamento**: um automático a cada ato, mais `POST /api/salvamento/criar`. `POST /api/salvamento/restaurar` (só o dono) volta a mesa e as fichas ao ponto e apaga o diário posterior. Ficam os 5 mais recentes.
- **Epílogo**: `POST /api/epilogo`, depois do fim da aventura; o Mestre conta o destino de cada personagem (uma chamada à IA, guardada na mesa).
- Itens novos usam os tipos que já existiam; o único efeito novo é `mana N`.

## Melhorias só de servidor (`melhorias.js`)

Valem com o app já instalado: aparecem na narração, no diário e no texto das rolagens. Tudo é acréscimo; as frases que já existiam no diário não mudam (o app reconhece eventos pelo texto) e nenhum aviso novo usa o tipo `narr` (o app leria em voz alta).

- **Memória da campanha** (`mesas.mundo`): o Mestre pode mandar `"memoria": {"fatos": {...}, "npcs": {...}, "reputacao": {...}}`. O servidor guarda (até 40 fatos, 24 NPCs e 8 grupos, reputação de -10 a +10) e manda tudo de volta em todo contexto. A mudança de reputação aparece no diário. O app não recebe a memória; os pontos de salvamento guardam e reiniciar a mesa apaga.
- **Encontros de estrada**: depois de 6 narrações e de uma mudança de cena, fora de combate, o Mestre recebe uma semente de encontro (uma vez).
- **Clima e período**: `"clima"` e `"periodo"` na resposta do Mestre. À noite e na neblina, Furtividade +2 e Percepção -2; na chuva, Atletismo e Acrobacia -2; o ajuste (no máximo ±2) entra no bônus e no texto da rolagem. O dia novo traz a manhã. `GET /api/mesa/:codigo` devolve `clima` e `periodo`.
- **Chance de sucesso** (`CHANCE_VISIVEL=1`): `(chance 55%)` no fim do texto da rolagem, só quando a mesa mostra a dificuldade.
- **Selos de resultado**: além de `acertou, N de dano`, `sucesso` e `falha`, o diário passa a trazer `crítico! N de dano`, `errou por pouco`, `falha por pouco`, `sucesso crítico`, `falha crítica`, `fraqueza: N de dano`, `resistiu: N de dano` e `imune: 0 de dano`.
- **Elementos** (fogo, gelo, raio, veneno, luz, sombra): o elemento vem do nome do ataque ou da magia; o inimigo pode ter `fraquezas` (dano ×1,5), `resistencias` (metade) e `imunidades` (zero). Na chuva o fogo causa metade do dano.
- **Condições com duração** (envenenado, em chamas, atordoado, protegido, regenerando): o Mestre aplica em `efeitos` (`{"alvo","status","turnos"}`); um crítico de fogo, veneno ou raio também deixa a condição. O efeito vale no começo do turno de quem a tem, de 1 a 5 turnos, só em combate; some no fim da luta ou no dia seguinte.
- **Inimigos que fogem**: com 1/4 da vida ou menos e em desvantagem numérica, metade das vezes o inimigo foge em vez de atacar (chefes com 40 PV ou mais e criaturas com menos de 6 PV não fogem).
- **XP**: `XP_POR_ACAO` por ação narrada e um marco para todos na virada de cada ato e no fim da história.
- **Fundos reaproveitados**: antes de gerar uma imagem, o servidor procura um arquivo em `public/fundos/<tema>/` ou `public/fundos/geral/` com o nome da cena ou do tipo de lugar (`taverna.webp`, `floresta.jpg`...), depois um fundo já gerado para a mesma cena do mesmo tema e, havendo 2 variantes, um do mesmo tipo de lugar. Só reaproveita imagens salvas neste servidor (`public/images/`).
- **Uso da IA**: cada chamada soma chamadas, tokens e custo (quando o provedor informa) em `uso_ia_diario`, por dia, tipo e modelo. `GET /api/admin/uso?dias=30` e a aba "Uso da IA" do painel.
- **Depuração**: `GET` e `PUT /api/admin/mesas/:codigo/mundo` (e o botão "Mundo" no painel) forçam clima, período, ato, fatos, reputação e o próximo encontro.
