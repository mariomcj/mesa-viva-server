# Mesa Viva — servidor

Servidor do Mesa Viva: Node.js + Express 5 + SQLite (better-sqlite3) + WebSocket, com a IA pelo OpenRouter. O app Flutter fica em [mesa-viva](https://github.com/mariomcj/mesa-viva).

## Rodar

```bash
npm install
OPENROUTER_API_KEY=sk-or-... npm start
npm test
```

Os testes (`test/`) cobrem o motor de regras e uma sessão inteira com uma IA simulada (mesa, combate, saque, nível, expedição, votação, epílogo, diário, pontos de salvamento e créditos). Se o `better-sqlite3` não estiver compilado na máquina, o servidor usa o SQLite embutido no Node 22 (`sqlite-compat.js`).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `server.js` | Rotas HTTP, WebSocket, banco e o fluxo do turno (`aplicar`, `avancarCombate`, `encerrarCombate`) |
| `regras.js` | Motor d20: testes, ataques, elementos, status, talentos, subclasses, itens, XP e níveis, turno dos inimigos |
| `mestre.js` | Prompt do Mestre, capítulos da aventura, encontros de estrada, epílogo e chamada ao OpenRouter |
| `campanha.js` | Flags de mundo, NPCs, reputação, bestiário, pontos de salvamento, votação e expedições |
| `creditos.js` | Créditos, teste grátis e medição do uso real da IA |
| `loja.js` | Validação de compras da Google Play |
| `fundos.js` | Fundos de cena: reaproveita, usa a biblioteca (`public/fundos/`) ou gera imagem |

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Chave da IA |
| `MODELO_RAPIDO` / `MODELO_CAPRICHADO` | Haiku 5.5 / Sonnet 5.5 | Modelos do Mestre |
| `COBRANCA_ATIVA` | `false` | Com `true`, mesas sem teste e sem créditos recebem 402 |
| `TESTE_DIAS` / `TESTE_CREDITOS` | `14` / `6` | Teste grátis: dias ou horas de mesa, o que acabar primeiro |
| `CREDITO_CHAMADA_RAPIDA` / `CREDITO_CHAMADA_CAPRICHADA` / `CREDITO_IMAGEM` | `0.012` / `0.07` / `0.04` | Quanto cada chamada consome (1 crédito ≈ 1 hora no modo Rápido) |
| `FUNDOS_MODO` | `reaproveitar` | `reaproveitar`, `biblioteca` (nunca gera imagem) ou `gerar` (antigo) |
| `GOOGLE_PLAY_PACKAGE` | `mesa.viva` | Pacote do app na Play Store |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | — | Caminho (ou conteúdo) do JSON da conta de serviço com acesso ao app |
| `APP_BUILD_MINIMO` / `APP_BUILD_ATUAL` | `1` / `2` | Versão mínima do app (abaixo dela o app avisa para atualizar) |
| `ADMIN_USER` / `ADMIN_PASS` | — | Painel admin (troque o padrão em produção) |
| `OPENROUTER_URL` | OpenRouter | Só para testes com IA simulada |

## Rotas novas (upgrade)

- `GET /api/versao`, `GET /api/regras/catalogo`
- `GET /api/conta/creditos`, `GET /api/loja/produtos`, `POST /api/loja/validar`
- `POST /api/ficha/escolher`, `POST /api/ficha/redistribuir`, `POST /api/ficha/dispensar-item`, `POST /api/saque/escolher`
- `POST /api/votar`, `POST /api/expedicao/iniciar`, `POST /api/epilogo`
- `GET /api/mesa/:codigo/diario`, `GET|POST /api/mesa/:codigo/saves`, `POST /api/mesa/:codigo/saves/:id/carregar`, `DELETE /api/mesa/:codigo/saves/:id`
- Admin: `GET /api/admin/uso`, `POST /api/admin/creditos`, `POST /api/admin/mesas/:codigo/flags`; `PUT /api/admin/mesas/:codigo` aceita `clima`, `periodo`, `capitulo`, `aventuraConcluida` e `encontro` (modo de depuração)

O banco antigo continua valendo: as colunas e tabelas novas são criadas sozinhas na primeira execução.

## Biblioteca de aventuras e idiomas

- **Aventuras** (`aventuras.js`): quatro aventuras de 5 capítulos, cada uma com títulos e objetivos em português e inglês. `GET /api/aventuras` lista; quem criou a mesa escolhe no saguão (`POST /api/configurar-mesa` com `aventura`) e, depois de concluir uma, segue para outra com os mesmos personagens (`POST /api/proxima-aventura`). Para criar uma aventura nova, acrescente um item em `AVENTURAS`.
- **Idioma do aparelho**: o app manda o cabeçalho `X-Idioma: pt | en`. Com `en`, o servidor traduz na saída os erros, as mensagens de sistema do diário, o catálogo de regras, os capítulos e os nomes de itens (`i18n.js`). O banco continua em português; o que não tiver tradução sai em português.
- **Idioma da mesa** (coluna `mesas.idioma`): define a língua em que o Mestre narra. Vem do aparelho de quem criou a mesa e pode ser trocado em Ajustes (`POST /api/configurar-mesa` com `idioma`).
