# Relatório: Narrativa e Prompts de IA — Mesa Viva RPG

> Baseado na análise do código atual (`mestre.js`, `server.js`, `regras.js`), dados empíricos de 109 narrações em produção, e engenharia reversa dos prompts do sistema.

---

## Índice

1. [Estrutura Narrativa: Aventura em 3 Atos](#1-estrutura-narrativa)
2. [Banco de NPCs Gerado por IA](#2-banco-de-npcs)
3. [Técnicas de Narração](#3-técnicas-de-narração)
4. [Prompt Engineering](#4-prompt-engineering)
5. [Personalização e Coerência do Mundo](#5-personalização)
6. [Geração Procedural (Quests, Loot, Encontros)](#6-geração-procedural)
7. [Apêndice: Estado Atual do Sistema](#7-apêndice)

---

## 1. Estrutura Narrativa

### 1.1 Estado Atual

A aventura **"A Mina de Pedra-Funda"** está definida como string literal em `mestre.js:64-72`. É um módulo de uma sessão — linear, 5 cenas, nível 1. O prompt da IA recebe a aventura completa em todo `contexto()`, mas a IA decidia o pacing e os ganchos. **Problema crítico resolvido em Nov 2026**: AVENTURA estava morta (nunca incluída no `contexto()`), agora está ativa.

**Problemas estruturais remanescentes:**
1. **Sem estrutura de 3 atos.** O AVENTURA atual é uma sequência plana de 5 cenas. A IA não recebe indicação de arco narrativo.
2. **Sem sistema de ganchos.** Não há campo no JSON de resposta para `gancho` ou `cliffhanger`.
3. **Sem estado narrativo.** O banco tem `fase` (lobby/jogando/...) mas não `ato` ou `arco`. A IA improvisa o arco inteiro.

### 1.2 Proposta: Aventura em 3 Atos no Prompt

Adicionar ao AVENTURA uma estrutura explícita que a IA entenda e use:

```js
const AVENTURA = `
Aventura de uma sessão: "A Mina de Pedra-Funda"
Nível sugerido: 1  |  Tom base: heróico com tons de terror leve

## ESTRUTURA EM 3 ATOS

### Ato I — O Chamado (estabelecer cenário, gancho, primeiro obstáculo)
Gancho: Na vila de Carvalho-Cinza, a mestra-mineira Odila Ventoforte contrata o grupo.
Goblins tomaram a mina de prata de Pedra-Funda. Seis mineiros sumidos. 50 peças de ouro por cabeça.
Clímax do Ato I: A primeira ameaça real — uma emboscada ou armadilha que force os PJs a mostrar do que são capazes.

### Ato II — A Descida (exploração, reviravoltas, custo crescente)
Conflito central: Os goblins não agem por maldade pura. Algo na mina os está controlando ou enlouquecendo.
Reviravolta sugerida: O cristal verde não é um tesouro — é uma prisão. Algo quer ser libertado (ou os goblins querem impedir que algo desperte).
Ponto médio (obrigatório): Os PJs encontram algo que muda sua compreensão da missão — mineiros mortos de forma estranha, um diário, um goblin que tenta se comunicar.
Custo: Algo se perde (um NPC aliado, um item importante, tempo).

### Ato III — O Conflito (decisão, clímax, desfecho)
Clímax: Confronto com Garra-Torta (hobgoblin) na Câmara do Cristal.
O cristal sussurra. Garra-Torta está enfeitiçado ou em transe.
Escolha final: Destruir o cristal? Usá-lo? Levá-lo a Odila? Negociar com o que está dentro?
Desfecho: Resgate dos mineiros, recompensa, gancho para próxima aventura (o que sobrou do cristal, uma carta lacrada, um símbolo estranho).
`;
```

### 1.3 Sistema de Ganchos e Cliffhangers

Adicionar ao `FORMATO` um campo opcional de gancho:

```json
{
  "narracao": "...",
  "cena": "...",
  "fundo": "...",
  "resumo": "...",
  "gancho": "Mistério ou ameaça iminente — o que prende a atenção para o próximo turno. Máximo 1 frase.",
  "cliffhanger": true ou false,
  "teste": null ou {...},
  "combate": null ou {...},
  "efeitos": []
}
```

**Estratégia de uso:** O `gancho` é renderizado na UI como um subtítulo ou badge (ex: "⚡ Garra-Torta range os dentes e avança"). O `cliffhanger: true` ativa um efeito visual de "continua..." e pausa de respiro antes da próxima ação.

### 1.4 Regra de Prompt para Cliffhanger

Adicionar ao `REGRAS`:

```
GANCHOS E CLIFFHANGERS:
- No final de cada resposta, inclua um gancho de 1 frase no campo "gancho".
- Se a cena terminar num momento de alta tensão (porta se abrindo, inimigo prestes a atacar, revelação chocante), marque "cliffhanger": true.
- Cliffhangers ativam pausa dramática na interface. Use com moderação — 1 a 2 por sessão.
```

### 1.5 Evento de Transição de Ato

Adicionar um endpoint ou convenção para a IA sinalizar mudança de ato no resumo:

Incluir no `FORMATO`:
```json
{
  "...",
  "ato": 1, // opcional: número do ato atual (1-3)
  "transicao": null ou "Ato I encerra com a emboscada na trilha. Ato II começa na entrada da mina."
}
```

Aí o `server.js` pode salvar `mesa.ato = r.ato` no banco e usá-lo no contexto da sessão.

---

## 2. Banco de NPCs

### 2.1 Estado Atual

A IA **improvisa NPCs do zero** a cada sessão. A AVENTURA menciona Odila Ventoforte (mestra-mineira) e Garra-Torta (hobgoblin). Não há:
- Banco de NPCs no banco de dados
- Geração automática de NPCs
- Contexto de NPCs entre sessões
- Personalidade/voz consistente

### 2.2 Proposta: Geração Automática de NPCs

#### Tabela `npcs` no SQLite

```sql
CREATE TABLE IF NOT EXISTS npcs (
  codigo TEXT NOT NULL,
  id TEXT NOT NULL,        -- uid único (curto, tipo "npc_odila")
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  personalidade TEXT DEFAULT '',
  voz TEXT DEFAULT '',     -- dica de voz para TTS (tom, ritmo, sotaque)
  segredo TEXT DEFAULT '',
  objetivos TEXT DEFAULT '',
  imagem TEXT DEFAULT '',
  relacoes TEXT DEFAULT '', -- JSON: { "npc_fulano": "inimigo", "pj_ciclano": "confia" }
  criadoEm INTEGER DEFAULT (strftime('%s','now')*1000),
  PRIMARY KEY (codigo, id)
);
```

#### Prompt de Geração de NPC

```js
const GERAR_NPC = `Gere um NPC para uma sessão de RPG de fantasia medieval. Deve ter nome, breve descrição física, personalidade marcante, um segredo e um objetivo atual.

Responda SOMENTE com JSON:

{
  "nome": "nome e sobrenome ou apelido",
  "descricao": "descrição física e profissional em 1-2 frases",
  "personalidade": "traço dominante + como se expressa (ex: 'desconfiado, fala em tom monocórdico e só responde com perguntas')",
  "voz": "descrição da voz para o narrador (ex: 'voz grave e arrastada, como quem carrega um peso nas costas')",
  "segredo": "algo que esconde (ex: 'sabe onde está a entrada secreta da mina mas tem medo de goblins')",
  "objetivo": "o que quer agora (ex: 'quem ser pago para sair da vila antes que reconheçam ele')",
  "humor": "humor inicial (amigavel, neutro, hostil, assustado, desconfiado)",
  "disposicao": "está disposto a ajudar? (sim, nao, talvez, mediante pagamento)",
  "gancho": "1 frase que o mestre pode usar para introduzir este NPC de forma memorável"
}`;
```

#### Fluxo de Uso

1. **Antes da sessão** (ou na primeira menção): `GERAR_NPC` + contexto do local → insere na tabela `npcs`
2. **Durante a sessão**: O `contexto()` inclui NPCs conhecidos no prompt:

```
PERSONAGENS CONHECIDOS (NPCs):
- Odila Ventoforte (mestra-mineira): voz firme e impaciente. Segredo: já viu o cristal antes. Objetivo: quer os mineiros vivos. Disposição: amigável.
- Garra-Torta (hobgoblin): voz gutural, confuso. Segredo: o cristal prometeu poder. Objetivo: proteger o cristal.
```

3. **Pós-sessão**: IA atualiza `relacoes` baseado no que aconteceu.

#### Exemplo Real de Uso no Contexto

Quando a mesa carrega, o `contexto()` faz uma query:

```js
const npcs = db.prepare("SELECT * FROM npcs WHERE codigo = ?").all(codigo);
// Inclui no prompt como NPCS CONHECIDOS
```

### 2.3 Dicas de Voz e Personalidade por NPC

Adicionar regra ao `REGRAS`:

```
VOZES DE NPCS:
- Dê a cada NPC uma voz distinta na narração. Use o campo "voz" para guiar o tom.
- NPCs importantes (quest-givers, vilões, aliados recorrentes) devem ter maneirismos verbais consistentes.
- Exemplos de variação de voz:
  * Odila: "voz metálica de quem comanda minas há 20 anos, impaciente, mãos na cintura"
  * Garra-Torta: "voz gutural, frases quebradas, respiração pesada"
  * Taberneiro: "voz cantada e acolhedora, gosta de contar histórias enquanto serve"
```

### 2.4 Rastro de Interações com NPCs

Para manter coerência, incluir no prompt o histórico de interações com NPCs:

```
HISTÓRICO DE INTERAÇÕES COM NPCs NESTA SESSÃO:
- Odila: os PJs aceitaram o contrato, pagamento prometido em ouro.
- Garra-Torta: ainda não encontraram.
- Taberneiro (Gus): deu dica sobre o brilho verde na mina.
```

Isso usa o `log` já existente, mas filtrado por NPCs.

---

## 3. Técnicas de Narração

### 3.1 Estado Atual

O `REGRAS` já inclui:
- ✅ Técnica ZOOM IN (ambiente → detalhe → elemento central)
- ✅ Cinco Sentidos
- ✅ Ritmo alternado (tensão/respiro)
- ✅ Diálogos diretos de NPCs
- ✅ Frases curtas (para ser ouvido, não lido)
- ✅ EXEMPLOS RUIM → BOM

**Problemas:**
- ❌ Sem instruções sobre **pacing temporal** (quanto tempo passar entre cenas)
- ❌ Sem **foreshadowing** explícito
- ❌ Sem **espelhamento** (refletir escolhas dos jogadores na narrativa)
- ❌ Sem **descrição de falhas** (o que acontece quando um teste falha)

### 3.2 Proposta: Adicionar ao REGRAS

#### Pacing Temporal

```
PACING E PASSAGEM DE TEMPO:
- Entre cenas, use "Algumas horas depois..." ou "Ao amanhecer..." para avançar o tempo.
- Não narre cada segundo. Avance para o próximo momento interessante.
- Se os jogadores estão parados discutindo, algo acontece — um barulho, alguém chega, o cenário muda.
- Depois de um combate, dê um respiro: descreva a calmaria, os personagens recuperando o fôlego.
```

#### Foreshadowing

```
Foreshadowing (PRESSÁGIOS):
- Semeie pistas sobre perigos futuros com 1-2 cenas de antecedência.
- Use elementos sutis: um cheiro estranho, uma marca na parede, um som ao longe, um pressentimento.
- Exemplo: antes da Câmara do Cristal, descreva um zumbido quase inaudível nas galerias anteriores e um brilho verde refletindo nas poças d'água.
- O foreshadowing se paga quando os jogadores reconhecem a pista e agem com base nela.
```

#### Descrição de Falhas

```
DESCRIÇÃO DE FALHAS:
- Quando um personagem falha num teste, narre a falha de forma cinematográfica, não punitiva.
- A falha deve complicar a situação ou criar uma escolha interessante, não apenas bloquear.
- Exemplo (bom): "Torgrim tenta pular a fenda, mas o pé escorrega na pedra molhada. Ele se segura pela borda com uma mão — e sente a pedra rachando." (agora os outros precisam agir)
- Exemplo (ruim): "Você falha no teste de Atletismo. Não consegue pular. Tente outra coisa."
```

#### Espelhamento (Refletir Escolhas)

```
ESPELHAMENTO:
- Quando um jogador faz uma escolha significativa, referencie-a na narração mais tarde.
- Se alguém foi corajoso, NPCs comentam. Se alguém foi cruel, o mundo reage.
- Exemplo: "O ferreiro reconhece vocês — 'Vocês são os que enfrentaram os goblins na mina, não são?' — e oferece um desconto."
```

### 3.3 Diálogos Memoráveis de NPCs

Regra adicional:

```
DIÁLOGOS DE NPCs:
- Cada NPC deve ter UM maneirismo de fala que o identifique sem precisar de tag.
- Exemplos:
  * Odila: começa frases com "Escuta aqui..." e aperta algo na mão
  * Garra-Torta: fala de si em terceira pessoa "Garra-Torta não tem medo de vocês"
  * Um goblin medroso: gagueja e repete a última palavra
- Diálogos devem revelar personalidade E informação. Nunca um sem o outro.
```

### 3.4 Inclusão Sensorial no Contexto Atual

A mina de Pedra-Funda já tem elementos sensoriais fortes. O prompt poderia listá-los:

```
ELEMENTOS SENSORIAIS DISPONÍVEIS (use como inspiração, não checklist):
- Visão: brilho verde pulsátil, paredes de pedra úmida, poças d'água, runas desgastadas, teias de aranha
- Audição: gotejar constante, zumbido agudo distante, passos ecoando, rangidos de madeira podre
- Olfato: cheiro de terra molhada, enxofre fraco, suor de goblin, ferrugem
- Tato: ar frio e pesado, musgo escorregadio, correntes de ar, vibração no chão
- Paladar: gosto metálico no ar (do cristal)
```

---

## 4. Prompt Engineering

### 4.1 Estado Atual

```
REGRAS      → system prompt do mestre (regras, tom, técnicas)
AVENTURA    → módulo de aventura ativo
CONTEXTO    → sessão atual (mesa, fichas, combate, log recente)
FORMATO     → estrutura JSON de resposta
```

**Tudo concatenado numa única mensagem `role: system`** em `contexto()` (linha 91-109). Isso é bom para prompt caching (OpenRouter cobra menos pelo prefixo repetido).

**Problemas identificados:**
- ✅ DUPLICATE FORMATO removido
- ✅ AVENTURA ativada
- ✅ role: system configurado
- ❌ Temperatura fixa em 0.7 (altura para narração, mas talvez baixa para criatividade)
- ❌ Sem few-shot examples no FORMATO
- ❌ Sem instruções de fronteira (o que a IA NÃO deve fazer além de "não pergunte")
- ❌ maxTokens 3000 pode ser pouco para cenas complexas
- ❌ Sem exemplo de JSON preenchido (só template vazio)

### 4.2 Proposta: Novo System Prompt Otimizado

#### Template FORMATO com Few-Shot

Substituir o FORMATO atual (linha 52-62) por:

```js
const FORMATO = `Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois. NUNCA use [[ROLAGEM]] ou marcações — use o campo "teste" abaixo.

Formato do JSON (preencha todos os campos):

{
  "narracao": "texto para ler em voz alta, 2 a 4 frases. Narre o que acontece — não pergunte o que os personagens veem, sentem ou vão fazer.",
  "cena": null ou "nome curto do local (máx 40 caracteres)",
  "fundo": null ou "URL de imagem apenas quando a cena mudar significativamente",
  "resumo": "resumo atualizado da história em até 5 frases",
  "gancho": "1 frase de mistério ou ameaça para manter o interesse até o próximo turno",
  "teste": null ou veja exemplos abaixo,
  "combate": null ou {"inimigos": [{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2}]},
  "efeitos": []
}

EXEMPLOS DE JSON PREENCHIDO:

--- Exemplo 1: Entrada na mina, sem combate
{
  "narracao": "A entrada da mina é um buraco escuro na face do penhasco, coberto por teias grossas como cordas. O cheiro de terra úmida e ferrugem envolve vocês. No chão, pegadas recentes — pés descalços e pequenos — se misturam a rastros de sangue seco. Da escuridão, um som metálico e ritmado ecoa.",
  "cena": "Entrada da Mina de Pedra-Funda",
  "fundo": null,
  "resumo": "O grupo chegou à Mina de Pedra-Funda, seguindo os rastros dos goblins. Pegadas recentes e sangue indicam que os sequestros aconteceram há pouco. Um som metálico vindo do interior sugere que há atividade na mina.",
  "gancho": "Lá dentro, algo bate contra o ferro — e não parece ser picaretas de mineiros.",
  "teste": null,
  "combate": null,
  "efeitos": []
}

--- Exemplo 2: Combate em andamento
{
  "narracao": "Elara dispara sua flecha que corta o ar e acerta o goblin no ombro. Ele grita um guincho agudo e cambaleia para trás, mas mantém a adaga erguida. O outro goblin, vendo o companheiro ferido, hesita — seus olhos amarelos se arregalam. O ar cheira a pólvora e suor.",
  "cena": "Trilha da Pedreira",
  "fundo": null,
  "resumo": "O grupo foi emboscado por 3 goblins na trilha. Um foi ferido por Elara. Os goblins estão organizados demais para criaturas selvagens, sugerindo que seguem ordens.",
  "gancho": "O goblin ferido solta algo que brilha verde — e o som de passos ecoa na trilha.",
  "teste": null,
  "combate": {"inimigos":[{"nome":"Goblin 1","pv":3,"ca":13,"ataque":4,"dano":"1d6+2","des":2},{"nome":"Goblin 2","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2}]},
  "efeitos": []
}

--- Exemplo 3: Cena social com teste
{
  "narracao": "Odila franze o cenho vasculhando a bolsa. 'Não pode ser. Sumiu. O medalhão da minha mãe — some com ele e o velho ferreiro vai ter um piripaque.' Ela aperta a têmpora com os dedos sujos de grafite. 'Eu dava minha mão direita por ele de volta.'",
  "cena": "Taverna Javali Cego",
  "fundo": null,
  "resumo": "Odila ofereceu o contrato. Agora percebe que perdeu o medalhão da mãe. Pede ajuda aos PJs para recuperá-lo.",
  "gancho": "De repente, um bêbado na mesa ao lado gargalha — ele sabe onde o medalhão foi parar.",
  "teste": {"tipo":"pericia","pericia":"Persuasao","cd":13,"motivo":"Convencer o bêbado a contar o que sabe"},
  "combate": null,
  "efeitos": []
}`;
```

#### Temperatura Adaptativa

Mudar a temperatura baseada no tipo de evento:

```js
// Em perguntar()
const temperatura = qualidade === "caprichado" ? 0.8 : 0.7;
```

E permitir que eventos narrativos usem temperatura maior que eventos de combate:

```js
// Para narração pura (abertura, exploração) → 0.8
// Para combate → 0.6 (menos criatividade, mais coerência tática)
// Para criação de NPC → 0.9 (muita criatividade)
```

#### Instruções de Fronteira (o que NÃO fazer)

Adicionar ao REGRAS:

```
LIMITES DA NARRAÇÃO:
- NÃO narre pensamentos dos personagens dos jogadores. Narre o mundo, ações de NPCs e consequências.
- NÃO invente decisões para os jogadores. Apresente situações, não soluções.
- NÃO faça NPCs onipotentes. Eles não sabem tudo. Eles erram, mentem, têm medo.
- NÃO resolva mistérios rápido demais. Uma pista por interação é suficiente.
- NÃO mate um personagem sem dar chance de reação. A morte de PJs só acontece com falha em teste de resistência ou em combate com aviso prévio.
- NÃO use "de repente" toda vez. Varie: "Um rangido...", "O ar muda...", "Algo se mexe na sombra..."
```

### 4.3 Estratégia de Modelos

Atual (em `perguntar()`):

```js
const model = qualidade === "caprichado"
  ? (process.env.MODELO_CAPRICHADO || "anthropic/claude-sonnet-5.5")
  : (process.env.MODELO_RAPIDO || "anthropic/claude-haiku-5.5");
```

**Problema:** Narração e combate usam o mesmo modelo. Sugestão:

```js
// Em contexto(): aceita um parâmetro de modo
// "narrativa" → model_caprichado (Claude Sonnet)
// "combate" → model_rapido (Claude Haiku)  
// "teste" → model_rapido
// "criacao" → model_caprichado
```

Ou simplificado: **toda chamada de IA usa model_caprichado para narração e model_rapido para rolagem/resultados**. O `server.js` já separa eventos (linhas 360, 400, 439, 458, 598) — cada um pode especificar qualidade.

### 4.4 Sistema de Revisão de Resposta (Sanity Check)

Implementar um pós-processamento que valide o JSON da IA antes de aplicar:

```js
function validarResposta(r) {
  const erros = [];
  if (!r.narracao || r.narracao.length < 10) erros.push("narracao muito curta");
  if (r.narracao && r.narracao.includes("?")) erros.push("narracao contém pergunta"); // não deve perguntar
  if (r.resumo && r.resumo.length > 500) erros.push("resumo muito longo");
  if (r.combate?.inimigos?.length > 10) erros.push("muitos inimigos num só combate");
  if (r.efeitos?.length > 6) erros.push("muitos efeitos simultâneos");
  
  if (erros.length) {
    console.warn(`Resposta da IA com problemas: ${erros.join(", ")}`);
    // Não bloqueia, só loga — mas pode forçar retry em produção
  }
  return true; // sempre prossegue por enquanto
}
```

---

## 5. Personalização

### 5.1 Estado Atual

- `resumo` é atualizado pela IA a cada resposta e armazenado em `mesa.resumo`
- `log` guarda todo o histórico da sessão (cresce sem limites)
- `contexto()` envia os últimos acontecimentos (recentes) + resumo + fichas

**Problemas:**
- ❌ **Sem memória entre sessões.** O resumo é só da sessão atual. Se a mesa volta do lobby, começa do zero.
- ❌ **Log inteiro é guardado mas nunca podado.** Cresce para sempre.
- ❌ **Sem dados de sessões anteriores no prompt.** A IA não lembra o que aconteceu na sessão passada.

### 5.2 Proposta: Memória Persistent

#### Tabela de Sessões

```sql
CREATE TABLE IF NOT EXISTS sessoes (
  codigo TEXT NOT NULL,
  sessao_id INTEGER PRIMARY KEY AUTOINCREMENT,
  resumo_final TEXT DEFAULT '',
  inicio INTEGER NOT NULL,
  fim INTEGER,
  npcs_envolvidos TEXT DEFAULT '[]'  -- JSON array de ids de NPCs
);
```

A cada fim de sessão (ou pause longo), o resumo final é salvo. Na abertura da próxima:

```js
// No contexto(), após carregar:
const sessaoAnterior = db.prepare(
  "SELECT resumo_final, fim FROM sessoes WHERE codigo = ? ORDER BY fim DESC LIMIT 1"
).get(codigo);

if (sessaoAnterior) {
  prompt += `\n\nSESSÃO ANTERIOR:\n${sessaoAnterior.resumo_final}\n\n(Os personagens lembram do que aconteceu. NPCs também.)`;
}
```

#### Resumo com Saldo de Relacionamentos

Incluir no resumo final de sessão o estado das relações com NPCs:

```js
// Ao salvar sessão:
const relacoes = db.prepare("SELECT relacoes FROM npcs WHERE codigo = ? AND relacoes != ''").all(codigo);
resumo_final += `\n\nRELAÇÕES:\n${relacoes.map(r => r.relacoes).join("\n")}`;
```

### 5.3 Contexto de Escolhas Anteriores

O resumo da IA já captura escolhas, mas podemos estruturar melhor. Incluir no prompt:

```
DECISÕES IMPORTANTES DOS JOGADORES ATÉ AGORA:
- [Herói] decidiu [ação] que resultou em [consequência]
- O grupo optou por [caminho A] em vez de [caminho B]
```

Isso pode vir de um campo extra no JSON da resposta:

```json
{
  "...",
  "decisao": "O grupo optou por negociar com os goblins em vez de atacar.",
  "consequencia": "Ganharam informação sobre o cristal, mas perderam a vantagem da surpresa."
}
```

Aí o server guarda `decisao` e `consequencia` no log como tipo especial.

### 5.4 Coerência do Mundo

Regra adicional para o REGRAS:

```
COERÊNCIA DO MUNDO:
- Antes de inventar um fato novo, pergunte-se: isso contradiz algo já estabelecido?
- Se um NPC foi morto ou ferido, NPCs que sabem disso agem de acordo.
- Se um item foi usado ou perdido, não reaparece sem explicação.
- O resumo da sessão anterior é lei. Use-o como base.
- Dúvida? Releia o resumo e o contexto antes de responder.
```

### 5.5 Lembrar de NPCs e Eventos

Adicionar ao `contexto()` uma seção de **Registro de Mundo**:

```js
// Buscar npcs conhecidos
const npcs = db.prepare(`
  SELECT nome, descricao, personalidade, segredo, objetivos, relacoes
  FROM npcs WHERE codigo = ?
`).all(codigo);

// Buscar decisões importantes
const decisoes = db.prepare(`
  SELECT texto FROM log 
  WHERE codigo = ? AND tipo = 'decisao'
  ORDER BY id DESC LIMIT 5
`).all(codigo);
```

Incluir ambas no prompt depois do resumo.

---

## 6. Geração Procedural

### 6.1 Estado Atual

- ❌ Sem geração de quests secundárias
- ❌ Sem geração de loot
- ❌ Encontros aleatórios são improvisados pela IA sem estrutura
- ❌ Tabelas de tesouro/equipamento não existem

### 6.2 Proposta: Sub-Quest Gerada por IA

#### Prompt de Quest Secundária

```js
const GERAR_QUEST = `Gere uma missão secundária de RPG de fantasia compatível com o cenário e nível da aventura principal.

Responda SOMENTE com JSON:

{
  "nome": "nome curto da missão",
  "gancho": "como os PJs descobrem sobre ela (1-2 frases)",
  "descricao": "o que precisa ser feito (2-3 frases)",
  "NPC": "quem oferece ou está envolvido",
  "recompensa": "o que ganham (ouro, item, informação, aliado)",
  "dificuldade": "facil | media | dificil",
  "complicacao": "reviravolta ou escolha difícil que a missão apresenta",
  "nivel_min": 1
}`;
```

#### Gatilhos para Quest Secundária

No `contexto()` ou na regra do REGRAS:

```
MISSÕES SECUNDÁRIAS:
- Quando os jogadores interagem com um NPC que não está diretamente na missão principal, considere gerar uma missão secundária.
- Gatilhos: um NPC com problema, um objeto estranho, um rumor na taverna, um pedido de ajuda.
- Missões secundárias não devem atrapalhar o ritmo da principal. Ofereça como escolha, não obrigação.
- A recompensa de uma missão secundária deve ser útil mas não essencial para a missão principal.
```

### 6.3 Loot Gerado por IA

#### Prompt de Loot

```js
const GERAR_LOOT = `Gere um item de saque para RPG de fantasia nível {NIVEL}.

Responda SOMENTE com JSON:

{
  "nome": "nome do item",
  "descricao": "aparência e sensação (1 frase)",
  "tipo": "arma | armadura | poção | ferramenta | relíquia | tesouro",
  "raridade": "comum | incomum | raro",
  "efeito": "descrição mecânica simples (ex: 'cura 1d8 PV', '+1 em Percepção', 'arma 1d6 de dano corte')",
  "valor": número de peças de ouro,
  "detalhe": "um toque narrativo (ex: 'tem uma inscrição élfica na lâmina: \"Para quem merecer\"')"
}`;
```

#### Quando Gerar Loot

No `server.js`, após fim de combate ou exploração de câmara:

```js
// Se a IA marcou uma cena como "exploravel" ou após derrotar inimigos com chefão
// Opção 1: IA inclui no JSON de resposta um campo "loot"
// Opção 2: endpoint separado /api/mesa/:codigo/gerar-loot
```

Sugestão: Incluir no FORMATO um campo opcional `loot`:

```json
{
  "...",
  "loot": null ou [{"nome": "Adaga de Ossos", "descricao": "uma adaga feita de fêmur de goblin", "tipo": "arma", "dano": "1d4 perfuração", "valor": 15}]
}
```

E no server.js, quando `r.loot` existir, salvar no banco (tabela `itens`) e distribuir via `efeitos`:

```sql
CREATE TABLE IF NOT EXISTS itens (
  codigo TEXT NOT NULL,
  id TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  tipo TEXT DEFAULT 'tesouro',
  raridade TEXT DEFAULT 'comum',
  efeito TEXT DEFAULT '',
  valor INTEGER DEFAULT 0,
  dono TEXT DEFAULT '', -- uid do personagem ou '' se no inventário da mesa
  PRIMARY KEY (codigo, id)
);
```

### 6.4 Encontros Aleatórios Estruturais

#### Prompt de Encontro Aleatório

O encontro aleatório atual é improvisado pela IA no fluxo da narração. Para dar mais estrutura, adicionar ao AVENTURA:

```
ENCONTROS ALEATÓRIOS (use conforme o ritmo da sessão):
- Na trilha: 1d3 goblins emboscada, ou um caçador ferido, ou uma caravana de anões
- Nas galerias: armadilha de corda, ou goblins jogando dados, ou um mineiro fugindo
- Na Câmara do Cristal (opcional): ecos do cristal criam ilusões dos medos dos personagens
```

E uma regra no REGRAS:

```
ENCONTROS ALEATÓRIOS:
- Não force encontro aleatório se o ritmo está bom. Use quando a sessão estiver lenta.
- Encontro aleatório deve sempre oferecer: informação, recurso ou combate (escolha um).
- Depois de um encontro aleatório, o caminho principal deve ficar mais claro, não mais confuso.
```

### 6.5 Sistema de Fama e Consequências

Para conectar escolhas a consequências de longo prazo:

```json
{
  "fama": "Se os jogadores fizeram algo notável (bom ou mau), descreva como a vila/Carvalho-Cinza reage. Ex: 'Os mineiros resgatados contam história. Agora vocês são conhecidos como "Os Libertadores de Pedra-Funda".'"
}
```

Adicionar ao FORMATO opcional:

```json
{
  "...",
  "fama": null ou "reputação que os jogadores estão ganhando (1 frase)"
}
```

E armazenar em `mesa.fama` para uso em sessões futuras.

---

## 7. Apêndice

### 7.1 Prompt de Criação de Personagem Otimizado

O `CRICACAO` atual (linhas 74-82) não inclui magias mesmo para Magos. Sugestão:

```js
const CRICACAO = `Crie uma ficha de personagem de RPG nível 1 para o seguinte conceito. Use regras d20 simplificadas:
Raças: Humano, Anão, Elfo, Halfling, Meio-orc.
Classes: Guerreiro, Ladino, Mago, Clérigo.
Atributos (8 a 17, soma máxima 72): for, des, con, int, sab, car.
Perícias treinadas: 2 + modificador de Inteligência (mínimo 1). Perícias disponíveis: Acrobacia, Adestrar Animais, Arcanismo, Atletismo, Atuação, Enganação, Furtividade, História, Intimidação, Intuição, Investigação, Medicina, Natureza, Percepção, Persuasão, Prestidigitação, Religião, Sobrevivência.
Ataque inicial: 1 (dano 1d6+modificador de Força ou Destreza).
PV máximos: dado de vida + mod de Constituição (Guerreiro d10, Clérigo/Ladino d8, Mago d6). CA: 10 + mod de Destreza + (se Guerreiro 2, se Clérigo 1).

IMPORTANTE: Se a classe for Mago, gere também 2 a 4 magias. Se Clérigo, 1 a 2 magias de suporte. Use as magias sugeridas pelo conceito do personagem ou crie compatíveis com o nível 1.

Responda SOMENTE com JSON no formato:
{"nome":"str","raca":"str","classe":"str","sexo":"str","antecedente":"str","atributos":{"for":N,"des":N,"con":N,"int":N,"sab":N,"car":N},"ca":N,"pericias":["str"],"ataques":[{"nome":"str","bonus":N,"dano":"NdN+?"}],"magias":[{"nome":"str","descricao":"str (1 frase)"}],"equipamento":["str"],"tracos":{"personalidade":"str","ideal":"str","vinculo":"str","defeito":"str"},"dica":"conselho curto de jogo"}`;
```

### 7.2 Prompt de Contexto Otimizado

Versão melhorada da função `contexto()` que inclui NPCs, decisões e fama:

```js
function contexto(mesa, fichas, recentes, npcs) {
  const { ATRIBUTOS, PERICIAS, mod, sinal } = require("./regras");
  const c = mesa.combate;
  const ini = c ? c.inimigos.filter((i) => i.pv > 0).map((i) => `- ${i.nome} [id ${i.id}]: PV ${i.pv}/${i.pvMax}, CA ${i.ca}`).join("\n") : "";
  const log = recentes.map((e) => e.tipo === "narr" ? `MESTRE: ${e.texto}` : e.tipo === "acao" ? `${e.nome}: ${e.texto}` : e.tipo === "decisao" ? `DECISÃO: ${e.texto}` : `(${e.texto})`).join("\n");
  const tom = { epico: "épico e heroico", humor: "leve, com humor", sombrio: "sombrio e tenso" }[mesa.tom] || "épico e heroico";
  
  let prompt = `${REGRAS}\n\n${AVENTURA}\n\nCONTEXTO DA SESSÃO:\n`;
  prompt += `- Cenário: A Mina de Pedra-Funda (fantasia clássica, vila de Carvalho-Cinza)\n`;
  prompt += `- Tom: ${tom}${mesa.vetos ? `\n- Temas vetados: ${mesa.vetos}` : ""}\n`;
  prompt += `- Ato: ${mesa.ato || 1} de 3\n`;
  
  prompt += `- Personagens:\n${fichas.map(resumoFicha).join("\n") || "(sem personagens)"}\n`;
  prompt += `- Resumo: ${mesa.resumo || "(início da aventura)"}\n`;
  prompt += `- Cena atual: ${mesa.cena || "Taverna Javali Cego"}\n`;
  
  if (mesa.fama) prompt += `- Fama: ${mesa.fama}\n`;
  
  // NPCs conhecidos
  if (npcs?.length) {
    prompt += `- NPCs conhecidos:\n`;
    for (const npc of npcs) {
      prompt += `  * ${npc.nome}: ${npc.descricao}. Personalidade: ${npc.personalidade}. Objetivo: ${npc.objetivo}. ${npc.relacoes && npc.relacoes !== "{}" ? `Relações: ${npc.relacoes}.` : ""}\n`;
    }
  }
  
  prompt += `${c ? `\nEM COMBATE (rodada ${c.rodada}). Inimigos vivos:\n${ini}` : "\nFora de combate."}\n`;
  prompt += `ÚLTIMOS ACONTECIMENTOS:\n${log || "(nenhum ainda)"}\n\n`;
  prompt += `${FORMATO}`;
  
  return prompt;
}
```

### 7.3 Pipeline de IA Completo (Estado Futuro Ideal)

```
[PLAYER] → AÇÃO via POST /api/mesa/:codigo/agir
    ↓
[server.js] → Carrega mesa, fichas, log recente, NPCs, decisões
    ↓
[contexto()] → Monta REGRAS + AVENTURA + contexto + FORMATO
    ↓
[perguntar()] → Envia para OpenRouter (modelo conforme tipo)
    ↓
[resposta JSON] → narracao, cena, fundo, resumo, gancho, teste, combate, efeitos, loot, fama, decisao
    ↓
[validarResposta()] → Sanity check da estrutura
    ↓
[aplicar()] → Salva log, atualiza ficha (PV/efeitos), inicia/avança combate, salva loot, atualiza fama
    ↓
[broadcast WebSocket] → Todos os clientes recebem a atualização
```

### 7.4 Prioridades de Implementação

| Prioridade | O quê | Por quê |
|-----------|-------|---------|
| 🔴 CRÍTICA | Sistema de memória entre sessões | Sem isso, cada sessão recomeça do zero |
| 🔴 CRÍTICA | Validação de resposta da IA | Evita narrações quebradas ou com perguntas |
| 🟡 ALTA | FORMATO com few-shot examples | 10x melhora na consistência das respostas |
| 🟡 ALTA | NPCs no banco de dados | Coerência entre sessões |
| 🟡 ALTA | Campo `gancho` no JSON | Engajamento e pacing |
| 🟢 MÉDIA | Geração de loot procedural | Recompensa tangível para exploração |
| 🟢 MÉDIA | Estrutura de 3 atos na AVENTURA | Arco narrativo mais satisfatório |
| 🟢 MÉDIA | Temperatura adaptativa | MAIS criatividade na narração, menos nos testes |
| 🔵 BAIXA | Missões secundárias | Depois do sistema básico funcionar |
| 🔵 BAIXA | Fama e reputação | Para sessões longas com o mesmo grupo |

---

*Relatório gerado em novembro de 2026. Baseado no código-fonte em `/opt/data/mesa-viva-server/mestre.js`, `server.js`, e `regras.js`, mais 109 narrações reais em produção.*