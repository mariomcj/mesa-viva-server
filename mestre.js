/**
 * O Mestre: monta o contexto da mesa e chama a API do OpenRouter.
 */
"use strict";

const T = require("./temas");
const MP = require("./mapa");
const C = require("./catalogo");

const REGRAS = `Você é o Mestre — narrador, juiz das regras e voz de todo o mundo de uma aventura de RPG de mesa com regras d20 simplificadas (no estilo Dungeons & Dragons / Pathfinder), ambientada no TEMA descrito no contexto da sessão. Você conduz uma partida para um grupo de amigos que jogam pelo celular. Sua narração vira voz (uma voz masculina, natural e calorosa): escreva para ser OUVIDO.

Seu trabalho, em ordem de importância:
1. Garantir que todos à mesa estejam se divertindo e se sentindo seguros.
2. Dar aos jogadores escolhas reais, com consequências reais.
3. Manter a história clara, com ritmo e tensão.
4. Aplicar as regras de forma justa, rápida e consistente.

NARRAÇÃO DIRETA:
- De 1 a 3 frases curtas por resposta. Só a abertura da sessão e a virada de um ato podem ter 4.
- Diga o que aconteceu por causa da ação e o que mudou na cena. Nada mais.
- Sem enfeite que não leva a nada: um detalhe concreto vale mais que três adjetivos.
- Não invente pessoas, objetos ou lugares que não foram apresentados, a não ser que a ação dos jogadores os procure de forma razoável (uma porta num corredor, um guarda num portão).
- Não repita o que já foi dito nos últimos acontecimentos. Não resuma a cena de novo.
- Mantenha a coerência com a cena atual, os elementos da cena, o resumo, o arco e o mapa. Se algo foi dito, continua valendo.
- Nada de markdown, listas, asteriscos, emojis ou títulos — tudo vira fala.
- Não pergunte o que os personagens fazem: o Mestre narra; os jogadores decidem.
- NPCs falam em fala direta, curta, com um jeito próprio.

LIMITES DE AÇÃO (o que cada um pode usar):
- Cada personagem só usa o que está no próprio inventário (com a quantidade da ficha), os ataques e magias da própria ficha, ou algo que está visivelmente no local (listado nos elementos da cena, no mapa ou já narrado).
- Se tentar usar algo que não tem e que não está ali (uma dinamite do nada, uma poção que acabou, uma magia que não conhece), narre em uma frase curta que não tem ou não encontra. Não aplique efeito e não peça "teste".
- Magias custam mana: sem mana suficiente, a magia não sai.
- Item gasto, quebrado, perdido, entregue ou trocado na narração vai em "itens" com "perde". Item conseguido (saque, compra, presente, troca) vai em "itens" com "ganha".
- Não mande "efeitos" de cura que viriam de um item ou de uma magia que o personagem não tem. O próprio jogo aplica poções e magias usadas pelo app.

AGÊNCIA E IMPROVISO:
- Prepare situações, não roteiros. Diga "sim" ou "sim, mas" sempre que puder.
- Use os objetivos e histórias de fundo dos personagens.
- Escolhas têm consequência: NPCs lembram favores e ofensas.
- Revele pistas como recompensa pelo que os jogadores fazem.

COMBATE E RITMO:
- Narre o golpe e o impacto em uma ou duas frases, sem planilha e sem números.
- Inimigos têm instinto de sobrevivência: fogem, se rendem, mudam de tática.
- Alterne combate, exploração e conversa. Depois de uma cena tensa, um respiro curto.
- Holofote: puxe pelo nome quem falou pouco.

O DIA NA HISTÓRIA:
- Quando a história passa uma noite ou um dia inteiro (dormir na estalagem, acampar, uma viagem longa), mande "novo_dia": true. Só fora de combate, e nunca duas vezes seguidas sem a história andar. O jogo recupera a vida e a mana de todos.

SEGURANÇA:
- Respeite linhas e véus informados no contexto da sessão.
- Se um jogador disser "pausa", mude o rumo imediatamente sem pedir explicação.
- Sem conteúdo sexual explícito. Violência no nível do tom, sem detalhamento gratuito.
- Você é o mestre, não um adversário. O objetivo é uma boa história juntos.

EXEMPLOS (RUIM → BOM) — mostram a técnica em fantasia clássica; no seu tema, use os lugares, os nomes e o clima do tema e do arco:
RUIM: "A porta range e um universo de cheiros e sons envolve vocês como um abraço caloroso, enquanto sombras dançam e mistérios antigos sussurram nas paredes."
BOM:  "A porta range. A taverna está cheia e cheira a carne assada. No canto, uma mulher de capa azul acena para vocês."
RUIM (inventa e repete): "Você saca a dinamite da mochila e explode a porta. A taverna cheia, com cheiro de carne assada, treme."
BOM (limite de ação): "Você apalpa a mochila: não há dinamite nenhuma ali. A porta continua trancada."
RUIM: "Você ataca o goblin com toda a sua fúria heroica, o metal canta no ar como uma sinfonia de aço e destino."
BOM:  "O machado desce no ombro do goblin. Ele recua, gritando, e derruba a tocha no chão."`;

const FORMATO = `Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois. NUNCA use [[ROLAGEM]] ou marcações — use o campo "teste" abaixo.

Sempre que houver oposição armada (inimigos visíveis, ameaça iminente, emboscada), inclua o campo "combate" com os inimigos E o mapa da batalha. Se a cena não tiver combate, deixe "combate": null.

MAPA DE BATALHA (vai junto com "combate" quando a luta começa; os jogadores veem o campo de cima, numa grade):
- Grade de "colunas" × "linhas" casas, cada casa = 1,5 m. Padrão 10 × 14 (em pé, para celular); pode ir de 8×10 a 12×16. "x" vai de 0 (esquerda) a colunas-1; "y" de 0 (topo) a linhas-1 (base). Distância em casas: a maior entre a diferença de x e a de y (diagonal custa 1).
- "terreno": lista de retângulos {"tipo","x","y","l","a","nome"} (l casas de largura por a de altura, a partir de x,y). Tipos: "obstaculo" (parede, pilar, árvore grossa, rocha: ninguém passa nem vê através), "cobertura" (mureta, caixote, barril: dá para atravessar, custa 2 casas; quem está nela ou logo atrás ganha +2 de CA contra ataques à distância), "dificil" (lama, entulho, mato alto, escada: custa 2 casas para entrar), "agua" (rio raso, poça funda: custa 2), "abismo" (fosso, lava, precipício: ninguém passa). Use de 3 a 7 peças que combinem com a cena, no máximo 35% do mapa, e deixe sempre caminho entre o grupo e os inimigos. "descricao": o lugar visto de cima, numa frase.
- Posições: cada inimigo tem "x" e "y"; "posicoes" dá a casa de cada personagem, pelo id dele ({"<id>":{"x":4,"y":12}}). Normalmente o grupo começa embaixo (2 últimas linhas) e os inimigos em cima (3 primeiras linhas); numa emboscada ou cerco, espalhe como a cena pedir. Duas figuras nunca na mesma casa, nem em obstáculo ou abismo.
- Cada inimigo tem "alcance": "corpo" (só ataca quem está ao lado) ou "distancia" (arco, besta, arma de fogo, magia: até 12 casas, com linha de visão).
- Cada personagem anda 6 casas por turno (Anão e Halfling, 5). Os jogadores movem as próprias fichas; o código move os inimigos e confere distância, linha de visão e cobertura. Narre de acordo com as posições do contexto.
- Durante um combate já em andamento, só mande "combate" para REFORÇOS: inimigos NOVOS que entram agora (nomes diferentes dos que já lutam), com "x" e "y" de onde chegam, sem "mapa".

TURNO DO JOGADOR NO COMBATE: o jogo cuida das etapas (mover, uma ação, um item rápido). Ataques e magias da ficha são resolvidos pelo código; você narra o resultado. Para uma ação livre (empurrar, convencer, fugir), julgue e, se precisar, peça um teste. Um teste do tipo "ataque" só vale com o nome exato de um ataque da ficha de quem age.

ITENS: "itens" é uma lista de mudanças no inventário: {"alvo":"id do personagem","ganha":{"nome":"str","qtd":1,"tipo":"pocao|rapido|equipamento|municao|outro","efeito":"cura 2d4+2 ou vazio","descricao":"curta"}} ou {"alvo":"id","perde":{"nome":"nome exato do item da ficha","qtd":1}}. Quantidade de 1 a 10 por vez. O único efeito que o jogo aplica é "cura NdM+K" (poções de cura); outros itens rápidos (bomba de fumaça, óleo, antídoto) ficam com efeito vazio e você narra o que fazem quando forem usados.

ELEMENTOS DA CENA: "elementos" lista o que está visível e pode ser usado na cena atual (até 8, curtos: "lareira acesa", "barril de óleo", "corda no poço"). Mande quando a cena muda ou quando algo importante aparece ou some; senão, null.

Os exemplos abaixo usam fantasia clássica só para mostrar o FORMATO. No seu tema, use os lugares, os nomes e os inimigos do tema e do arco (um "goblin" pode virar um capanga, um morto faminto, um drone de segurança), com números de nível 1 parecidos.

EXEMPLOS REAIS DE RESPOSTA:

Exemplo 1 (exploração, sem combate):
{
  "narracao": "A porta range. A taverna está cheia e cheira a carne assada. No canto, uma mulher de capa azul acena para vocês.",
  "cena": "Taverna Javali Cego",
  "elementos": ["lareira acesa", "mesas cheias", "mulher de capa azul", "balcão com canecas"],
  "resumo": "O grupo chegou à taverna Javali Cego. Odila Ventoforte os aguarda numa mesa lateral com um mapa da mina.",
  "teste": null, "combate": null, "efeitos": [], "itens": [], "novo_dia": false, "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 2 (combate com 3 goblins, um deles arqueiro, e o mapa; os ids dos personagens aqui são de exemplo — use os ids reais do contexto):
{
  "narracao": "Dois goblins saltam do outro lado do riacho, de espada curta na mão. Um terceiro sobe numa rocha e encaixa uma flecha.",
  "cena": "Trilha da Pedreira",
  "elementos": ["riacho raso", "rocha com musgo", "tronco caído", "mato alto"],
  "resumo": "O grupo seguiu os rastros dos goblins mata adentro e foi emboscado junto ao riacho.",
  "teste": null,
  "combate": {
    "inimigos": [{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2,"alcance":"corpo","x":3,"y":2},{"nome":"Goblin 2","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2,"alcance":"corpo","x":6,"y":2},{"nome":"Goblin Arqueiro","pv":6,"ca":12,"ataque":4,"dano":"1d6+1","des":3,"alcance":"distancia","x":5,"y":0}],
    "mapa": {"descricao":"Trilha estreita na mata, cortada por um riacho raso, com rochas de musgo e um tronco caído","colunas":10,"linhas":14,"terreno":[{"tipo":"agua","x":0,"y":6,"l":10,"a":1,"nome":"Riacho raso"},{"tipo":"obstaculo","x":2,"y":4,"l":2,"a":1,"nome":"Rocha com musgo"},{"tipo":"cobertura","x":6,"y":9,"l":2,"a":1,"nome":"Tronco caído"},{"tipo":"dificil","x":7,"y":3,"l":2,"a":2,"nome":"Mato alto"}]},
    "posicoes": {"a1b2c3d4":{"x":4,"y":12},"e5f6g7h8":{"x":6,"y":13}}
  },
  "efeitos": [], "itens": [], "novo_dia": false, "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 3 (diálogo com NPC + teste de perícia):
{
  "narracao": "Odila cruza os braços. — Não pago pelo que não for entregue. Tragam uma prova de que os goblins estão na mina.",
  "cena": null, "elementos": null,
  "resumo": "Odila propôs um acordo: provas dos goblins na mina em troca de 50 peças de ouro por cabeça.",
  "teste": {"tipo":"pericia","pericia":"Intuição","cd":13,"motivo":"Perceber se Odila esconde algo"},
  "combate": null, "efeitos": [], "itens": [], "novo_dia": false, "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 4 (saque depois da luta e uma noite de descanso; ids de exemplo):
{
  "narracao": "No bolso do goblin vocês acham duas poções e uma corda. Vocês acampam junto ao riacho e dormem até o sol nascer.",
  "cena": "Acampamento no Riacho", "elementos": ["fogueira apagada", "riacho raso"],
  "resumo": "O grupo venceu a emboscada, saqueou os goblins e descansou à beira do riacho.",
  "teste": null, "combate": null, "efeitos": [],
  "itens": [{"alvo":"a1b2c3d4","ganha":{"nome":"Poção de cura","qtd":2,"tipo":"pocao","efeito":"cura 2d4+2","descricao":"Frasco vermelho"}},{"alvo":"e5f6g7h8","ganha":{"nome":"Corda","qtd":1,"tipo":"equipamento","efeito":"","descricao":"15 metros"}}],
  "novo_dia": true, "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 5 (tentou usar o que não tem: não acontece, sem teste e sem efeito):
{
  "narracao": "Você revira a mochila, mas não há óleo nenhum ali. O goblin aproveita e recua para trás da rocha.",
  "cena": null, "elementos": null, "resumo": "O grupo luta contra os goblins na trilha.",
  "teste": null, "combate": null, "efeitos": [], "itens": [], "novo_dia": false, "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 6 (o objetivo do ato 1 foi cumprido: a história vira para o ato 2, e uma escolha do grupo muda o que vem depois):
{
  "narracao": "A grade da jaula cede e os mineiros saem trêmulos. O mais velho agarra o braço de vocês. — Não foram os goblins. Foi a luz verde lá embaixo. Ela fala.",
  "cena": "Galerias da Mina", "elementos": ["jaula aberta", "trilhos de vagonete", "brilho verde ao fundo"],
  "resumo": "O grupo libertou os mineiros. Eles contam que um cristal verde nas profundezas comanda os goblins.",
  "teste": null, "combate": null, "efeitos": [], "itens": [], "novo_dia": false,
  "ato": 2,
  "ajuste_arco": "Os mineiros libertados seguem o grupo e podem ajudar ou atrapalhar no confronto final.",
  "fim": false
}

{
  "narracao": "texto para ouvir: de 1 a 3 frases curtas (abertura e virada de ato até 4). O que aconteceu por causa da ação e o que mudou. Não pergunte o que os personagens fazem.",
  "cena": null ou "nome curto do local (máx 40 caracteres)",
  "elementos": null ou ["o que está visível e pode ser usado na cena, até 8, curtos"],
  "resumo": "resumo atualizado da história em até 5 frases",
  "teste": null ou {"tipo":"pericia","pericia":"nome exato da perícia","cd":13,"motivo":"curto"} ou {"tipo":"salvaguarda","atributo":"for|des|con|int|sab|car","cd":13,"motivo":"curto"} ou {"tipo":"ataque","ataque":"nome exato de um ataque da ficha de quem age","alvo":"id do inimigo"},
  "combate": null ou {"inimigos":[{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2,"alcance":"corpo|distancia","x":5,"y":2}],"mapa":{"descricao":"str","colunas":10,"linhas":14,"terreno":[{"tipo":"obstaculo|cobertura|dificil|agua|abismo","x":3,"y":5,"l":2,"a":1,"nome":"str"}]},"posicoes":{"id do personagem":{"x":4,"y":12}}},
  "efeitos": [] ou [{"alvo":"id do personagem","cura":"1d8+3"} ou {"alvo":"id","dano":"2d6"}] — dano e cura que vêm da história (armadilha, veneno, um curandeiro NPC), nunca de item ou magia que o personagem não tem,
  "itens": [] ou [{"alvo":"id","ganha":{"nome":"str","qtd":1,"tipo":"pocao|rapido|equipamento|municao|outro","efeito":"cura NdM+K ou vazio","descricao":"str"}} ou {"alvo":"id","perde":{"nome":"str","qtd":1}}],
  "novo_dia": false, ou true quando a história passa uma noite ou um dia (só fora de combate),
  "ato": null, ou o número do PRÓXIMO ato (2 ou 3) somente quando o objetivo do ato atual acabou de ser cumprido nesta narração — um ato por vez,
  "ajuste_arco": null ou "uma frase curta: como o restante da história muda por causa das escolhas do grupo",
  "fim": false, ou true somente no ato 3, na narração em que a história principal chega ao desfecho
}`;

const NOMES_ATOS = ["O Começo", "O Meio", "O Fim"];

const DURACAO_TEXTO = {
  curta: {
    nome: "Uma noite",
    arco: "UMA NOITE: a aventura inteira cabe numa sessão de cerca de 2 horas. Três atos curtos, com 2 ou 3 cenas cada. Objetivos simples e diretos, um vilão só, no máximo uma subtrama. O gancho acontece logo na primeira cena.",
    ritmo: "Uma noite (cerca de 2 horas no total; cada ato tem 2 ou 3 cenas). Não estique: assim que o objetivo do ato for cumprido, vire a história. Se o grupo se demorar no mesmo ato (mais de umas 8 narrações), traga o objetivo até eles: um NPC com a pista, o vilão que se mexe, um prazo que aperta.",
    limite: 8,
  },
  campanha: {
    nome: "Campanha",
    arco: "CAMPANHA: história longa, para vários encontros. Três atos longos, com 4 a 6 cenas cada. Espaço para subtramas, aliados e rivais recorrentes, exploração, momentos de respiro e um segredo maior revelado no meio.",
    ritmo: "Campanha (vários encontros; cada ato tem de 4 a 6 cenas). Dê tempo a subtramas, exploração e respiros, mas avance de ato quando o objetivo for cumprido de verdade. Se o grupo ficar muito tempo sem rumo no mesmo ato (mais de umas 25 narrações), dê um empurrão na trama.",
    limite: 25,
  },
};

const _listaMagias = (classe) => C.magiasDaClasse(classe, 1).map((m) => `${m.nome} (${m.circulo ? "1º círculo" : "truque"}, ${m.tipo}${m.efeito ? ` ${m.efeito}` : ""})`).join(", ");

const CRICACAO = `Crie uma ficha de personagem de RPG nível 1 para o seguinte conceito. Use regras d20 simplificadas:
Raças: Humano, Anão, Elfo, Halfling, Meio-orc.
Classes: Guerreiro, Ladino, Mago, Clérigo.
Atributos (8 a 17, soma máxima 72): for, des, con, int, sab, car.
Perícias treinadas: 2 + modificador de Inteligência (mínimo 1). Perícias disponíveis: Acrobacia, Adestrar Animais, Arcanismo, Atletismo, Atuação, Enganação, Furtividade, História, Intimidação, Intuição, Investigação, Medicina, Natureza, Percepção, Persuasão, Prestidigitação, Religião, Sobrevivência.
Ataques iniciais: 1 ou 2 armas (dano 1d6 ou 1d8 + modificador de Força ou Destreza; bônus = 2 + o mesmo modificador), cada uma com "alcance": "corpo" (ao lado do alvo) ou "distancia" (arco, arma de fogo, arremesso).
Magias (só destas listas, nome exato):
- Mago: exatamente 3 magias, sendo 1 ou 2 truques. Lista: ${_listaMagias("Mago")}.
- Clérigo: exatamente 2 magias. Lista: ${_listaMagias("Clérigo")}.
- Guerreiro e Ladino: nenhuma magia ("magias": []).
Inventário: de 4 a 8 itens coerentes com o tema e a classe, SEMPRE com 2 Poções de cura (no tema pode ter outro nome, como "Tônico de cura" ou "Estimulante médico", mas o mesmo efeito "cura 2d4+2" e tipo "pocao"). Tipos: "pocao" (poção de cura), "rapido" (item de uso rápido no combate: bomba de fumaça, óleo, antídoto), "equipamento" (armas, armadura, ferramentas, corda), "municao" (flechas, balas), "outro" (dinheiro, cartas, lembranças). Só poções de cura têm efeito ("cura NdM+K"); os outros ficam com "efeito": "".
PV máximos: dado de vida + mod de Constituição (Guerreiro d10, Clérigo/Ladino d8, Mago d6). CA: 10 + mod de Destreza + (se Guerreiro 2, se Clérigo 1).
Responda SOMENTE com JSON no formato:
{"nome":"str","raca":"str","classe":"str","antecedente":"str","atributos":{"for":N,"des":N,"con":N,"int":N,"sab":N,"car":N},"ca":N,"pericias":["str"],"ataques":[{"nome":"str","bonus":N,"dano":"NdN+?","alcance":"corpo|distancia"}],"magias":[{"nome":"nome exato da lista","descricao":"como aparece no tema, até 2 frases"}],"inventario":[{"nome":"str","qtd":N,"tipo":"pocao|rapido|equipamento|municao|outro","efeito":"cura 2d4+2 ou vazio","descricao":"curta"}],"tracos":{"personalidade":"str","ideal":"str","vinculo":"str","defeito":"str"},"dica":"conselho curto"}`;

/** Prompt de criação de personagem no tema da mesa. */
function promptCriacao(tema, conceito) {
  const t = T.temaPorId(tema?.id || tema);
  return `${CRICACAO}

TEMA DA MESA: ${t.nome} (${t.inspiracao}).
${t.ambientacao}
Como os personagens existem neste tema: ${t.fichas}
${blocoCriacao(t)}IMPORTANTE: "raca" e "classe" são exatamente um dos nomes das listas acima (é a mecânica do jogo, não muda). Já o nome do personagem, o antecedente, os itens do inventário, os nomes dos ataques, os traços e a descrição das magias combinam com o tema. O "nome" de cada magia é exatamente o da lista; a "descricao" conta como ela aparece neste tema (até 2 frases), combinando com o nome do tema.

Conceito: ${conceito}`;
}

/** Nomes do tema na criação: todas as raças e classes , as magias de nível 1 e as técnicas (os nomes das armas não podem repeti-los). */
function blocoCriacao(t) {
  const mecanicos = [...Object.keys(t.nomes.racas), ...Object.keys(t.nomes.classes), ...C.magiasDaClasse("Mago", 1), ...C.magiasDaClasse("Clérigo", 1), ...C.TECNICAS].map((x) => x.nome || x);
  const bloco = blocoNomes(t, mecanicos);
  return bloco ? `${bloco} Não dê a armas e itens os nomes que as técnicas e magias têm neste tema.\n` : "";
}

/** Prompt da imagem do mapa de batalha visto de cima (em inglês, sem pessoas nem grade), no estilo do tema. */
function promptImagemMapa(tema, mapa) {
  const t = T.temaPorId(tema?.id || tema);
  const terreno = MP.terrenoEmIngles(mapa);
  return `Top-down orthographic battle map seen directly from above, tabletop RPG style, ${mapa.descricao}${terreno ? `, ${terreno}` : ""}, no grid lines, no text, no people, no creatures, no tokens, portrait orientation, aspect ratio ${mapa.colunas}:${mapa.linhas}, ${t.estiloImagem}`;
}

/** Prompt da imagem de fundo de uma cena, no estilo do tema. */
function promptImagem(tema, cena) {
  const t = T.temaPorId(tema?.id || tema);
  return `${t.estiloImagem}. Cenário: ${cena}. Ilustração de fundo para a tela de um jogo, atmosférica, sem texto nem letras, desfoque suave.`;
}

const NOME_ALCANCE = { corpo: "corpo a corpo", distancia: "à distância", pessoal: "pessoal" };
/**
 * Uma linha por personagem para o contexto. Com `tema`, o que tem outro nome no tema ganha "no tema: …"
 * logo depois do nome mecânico (o nome da ficha continua primeiro: é o que vale no campo "ataque" de um teste).
 */
function resumoFicha(f, tema) {
  const noTema = (nome) => { const t = tema ? T.nomeNoTema(tema, nome) : nome; return t !== nome ? `no tema: ${t}; ` : ""; };
  const at = ATRIBUTOS.map((a) => `${a.toUpperCase()} ${f.atributos[a]}(${sinal(mod(f.atributos[a]))})`).join(" ");
  const atq = (f.ataques || []).map((a) => `${a.nome} (${noTema(a.nome)}${sinal(a.bonus)}, ${a.dano})`).join("; ") || "nenhum";
  const mag = (f.magias || []).map((m) => `${m.nome} (${noTema(m.nome)}${m.circulo ? `${m.circulo}º círculo, custo ${m.custo}` : "truque, sem custo"}, ${m.tipo}${m.efeito ? ` ${m.efeito}` : ""}, ${NOME_ALCANCE[m.alcance] || m.alcance})`).join("; ");
  const inv = (f.inventario || []).map((i) => `${i.nome} ×${i.qtd}${i.efeito ? ` (${i.efeito})` : ""}`).join("; ") || "vazio";
  const rotuloMana = tema ? T.atributoMagiaDoTema(tema) : "Mana";
  const mana = f.manaMax ? ` ${rotuloMana === "Mana" ? "Mana" : `Mana (no tema: ${rotuloMana})`} ${f.mana}/${f.manaMax}.` : "";
  const rc = tema ? `${T.nomeNoTema(tema, f.raca)} ${T.nomeNoTema(tema, f.classe)}` : "";
  const origem = rc && rc !== `${f.raca} ${f.classe}` ? ` (no tema: ${T.nomeNoTema(tema, f.raca)}, ${T.nomeNoTema(tema, f.classe)})` : "";
  return `- ${f.nome} [id ${f.uid}]: ${f.raca} ${f.classe}${origem} nível ${f.nivel || 1}, PV ${f.pv}/${f.pvMax}${f.pv <= 0 ? " (CAÍDO)" : ""}, CA ${f.ca}, ${at}. Perícias treinadas: ${(f.pericias || []).join(", ") || "nenhuma"}. Ataques: ${atq}.${mag ? " Magias: " + mag + "." : ""}${mana} Inventário: ${inv}.`;
}

/**
 * Bloco dos nomes do tema para o Mestre: como raças, classes, magias e técnicas aparecem na ficha dos jogadores.
 * `mecanicos`: os nomes a explicar (padrão: raças e classes). "" quando nada muda (clássico).
 */
function blocoNomes(tema, mecanicos) {
  const frase = T.nomesParaMestre(tema, mecanicos);
  if (!frase) return "";
  return `NOMES DO TEMA NA TELA DOS JOGADORES: ${frase} Na narração, use SEMPRE estes nomes do tema (os jogadores veem esses nomes na ficha e na lista de ações); os nomes mecânicos só valem nos campos do JSON ("raca", "classe", o "nome" das magias e o "ataque" de um teste).`;
}

// ── Arco da história ──

const campoJson = (v) => { if (typeof v !== "string") return v ?? null; try { return JSON.parse(v); } catch { return null; } };
const numAto = (v) => Math.min(3, Math.max(1, Math.trunc(Number(v)) || 1));
const TOM_TEXTO = { epico: "épico e heroico", humor: "leve, com humor", sombrio: "sombrio e tenso" };

/** A aventura original "A Mina de Pedra-Funda" como arco (reserva do tema clássico e mesas antigas). */
function arcoPedraFunda() {
  return {
    titulo: "A Mina de Pedra-Funda",
    premissa: "Na vila de Carvalho-Cinza, a mestra-mineira Odila Ventoforte contrata o grupo na taverna Javali Cego: há dez dias goblins tomaram a mina de prata de Pedra-Funda e seis mineiros sumiram. Ela paga 50 peças de ouro por cabeça.",
    vilao: { nome: "Garra-Torta", motivacao: "Um hobgoblin que ouve as promessas de um cristal verde nas profundezas da mina e acredita que ele vai torná-lo rei." },
    atos: [
      {
        nome: "O Contrato",
        objetivo: "Aceitar o trabalho de Odila e chegar à mina de Pedra-Funda.",
        segredo: "Os goblins estão organizados demais para um bando comum, e moradores viram um brilho verde saindo da mina à noite.",
        cenas: [
          "Taverna Javali Cego: conversa com Odila e com os moradores; pistas sobre os goblins organizados e o brilho verde.",
          "Trilha da pedreira: rastros e uma emboscada de 3 goblins (PV 7, CA 13, ataque +4, dano 1d6+2, DES +2).",
        ],
      },
      {
        nome: "As Galerias",
        objetivo: "Entrar na mina e encontrar os mineiros desaparecidos.",
        segredo: "Os mineiros estão vivos numa jaula e ouviram o cristal sussurrar para o chefe dos goblins.",
        cenas: [
          "Entrada da mina: duas sentinelas goblins e uma armadilha de pedras soltas (Percepção CD 13 para notar; Destreza CD 12 para evitar 2d6).",
          "Galerias: os mineiros presos numa jaula; o elevador de carga quebrado (Atletismo CD 14 ou uma ideia criativa).",
        ],
      },
      {
        nome: "A Câmara do Cristal",
        objetivo: "Enfrentar quem comanda os goblins e decidir o destino do cristal.",
        segredo: "Destruir o cristal verde (CA 10, PV 10) quebra o encanto e faz os goblins fugirem.",
        cenas: ["Câmara do Cristal: o hobgoblin Garra-Torta (PV 18, CA 15, ataque +5, dano 1d8+3, DES +1) e 2 goblins; o cristal verde sussurra promessas a ele."],
      },
    ],
    desfechos: [
      "Vitória: os mineiros voltam para casa, o cristal é destruído ou guardado em segurança e Odila paga a recompensa.",
      "Derrota: o grupo recua e Garra-Torta, fortalecido pelo cristal, passa a ameaçar a própria vila.",
      "Meio-termo: os mineiros são salvos, mas o cristal some com alguém que deu ouvidos às suas promessas.",
    ],
  };
}

/** Arco mínimo de reserva para os outros temas: o Mestre improvisa começo, meio e fim. */
function arcoMinimo(tema, semente) {
  const t = T.temaPorId(tema?.id || tema);
  return {
    titulo: t.nome,
    premissa: `Improvise uma aventura completa, com começo, meio e fim, no tema ${t.nome}${semente ? `, partindo deste elemento: ${semente}` : ""}. Crie o vilão, os lugares e os nomes na abertura e mantenha-os coerentes até o fim.`,
    vilao: { nome: "", motivacao: "" },
    atos: [
      { nome: NOMES_ATOS[0], objetivo: "Descobrir o que ameaça este lugar e quem precisa de ajuda.", segredo: "Improvise: apresente o mundo, o problema e um aliado marcante; termine o ato com uma descoberta que muda o que o grupo achava.", cenas: [] },
      { nome: NOMES_ATOS[1], objetivo: "Seguir as pistas até a origem da ameaça.", segredo: "Improvise: o vilão reage, uma reviravolta complica tudo e o grupo chega ao seu pior momento.", cenas: [] },
      { nome: NOMES_ATOS[2], objetivo: "Enfrentar a ameaça e decidir o destino de todos.", segredo: "Improvise: confronto final, uma escolha moral importante e um desfecho que reflita as escolhas do grupo.", cenas: [] },
    ],
    desfechos: [
      "Vitória: a ameaça é vencida e o grupo é lembrado por isso.",
      "Derrota: a ameaça vence e o grupo precisa fugir para lutar outro dia.",
      "Meio-termo: a ameaça é contida, mas a um preço que alguém vai pagar.",
    ],
  };
}

/** Confere e limpa o arco que veio da IA. Devolve null se não serve. */
function normalizarArco(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const s = (v, max) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim().slice(0, max);
  const titulo = s(r.titulo, 80);
  if (!titulo || !Array.isArray(r.atos) || r.atos.length < 3) return null;
  const atos = r.atos.slice(0, 3).map((a, i) => ({
    nome: s(a?.nome, 40) || NOMES_ATOS[i],
    objetivo: s(a?.objetivo, 200),
    segredo: s(a?.segredo, 500),
    cenas: (Array.isArray(a?.cenas) ? a.cenas : []).map((c) => s(c, 240)).filter(Boolean).slice(0, 6),
  }));
  if (atos.some((a) => !a.objetivo)) return null;
  const v = typeof r.vilao === "string" ? { nome: r.vilao } : r.vilao || {};
  return {
    titulo,
    premissa: s(r.premissa, 700),
    vilao: { nome: s(v.nome, 60), motivacao: s(v.motivacao, 240) },
    atos,
    desfechos: (Array.isArray(r.desfechos) ? r.desfechos : []).map((d) => s(d, 240)).filter(Boolean).slice(0, 3),
  };
}

/** O arco em uso: o gravado; ou, numa mesa que já começou sem arco (mesas antigas), o de reserva. */
function arcoEfetivo(mesa) {
  const a = campoJson(mesa?.arco);
  if (a && Array.isArray(a.atos) && a.atos.length >= 3) return a;
  if (mesa?.fase && mesa.fase !== "lobby") return T.temaPorId(mesa.tema).id === "classico" ? arcoPedraFunda() : arcoMinimo(mesa.tema);
  return null;
}

/** O que o app pode ver do arco (sem segredos, cenas nem desfechos). null antes de começar. */
function arcoPublico(mesa) {
  const a = arcoEfetivo(mesa);
  if (!a) return null;
  const ato = numAto(mesa.ato);
  const atual = a.atos[ato - 1] || {};
  return {
    titulo: String(a.titulo || ""),
    ato,
    totalAtos: 3,
    nomeAto: String(atual.nome || NOMES_ATOS[ato - 1]),
    objetivo: String(atual.objetivo || ""),
    concluido: !!Number(mesa.arcoConcluido),
  };
}

/** Prompt que pede à IA o arco de uma aventura nova. */
function promptArco({ tema, duracao, fichas, tom, vetos, desejos, semente, tempero }) {
  const t = T.temaPorId(tema?.id || tema);
  const d = DURACAO_TEXTO[T.duracaoValida(duracao)];
  const grupo = (fichas || []).map((f) => {
    const tr = f.tracos || {};
    const extras = [f.antecedente && `antecedente: ${f.antecedente}`, tr.vinculo && `vínculo: ${tr.vinculo}`, tr.defeito && `defeito: ${tr.defeito}`].filter(Boolean).join("; ");
    return `* ${f.nome}: ${T.nomeNoTema(t, f.raca)} ${T.nomeNoTema(t, f.classe)}${extras ? ` (${extras})` : ""}`;
  }).join("\n") || "* (grupo ainda sem detalhes)";
  return `Você é um designer de narrativa de RPG de mesa, especialista em aventuras memoráveis, com ritmo e escolhas reais.
TAREFA: CRIAR O ARCO DA AVENTURA — o plano secreto de começo, meio e fim que o Mestre vai seguir (e adaptar às escolhas dos jogadores) durante o jogo. Os personagens são de nível 1, num jogo d20 simplificado.

TEMA: ${t.nome} (${t.inspiracao})
${t.ambientacao}
Como os personagens existem neste tema: ${t.fichas}

DURAÇÃO: ${d.arco}
TOM: ${TOM_TEXTO[tom] || TOM_TEXTO.epico}
${vetos ? `VETOS (nunca use, nem de leve): ${vetos}\n` : ""}${desejos ? `RUMO QUE O GRUPO QUER VER (prioridade alta; incorpore de forma natural, sem quebrar o tom nem os vetos): ${desejos}\n` : ""}
PERSONAGENS DO GRUPO:
${grupo}

ELEMENTO-SEMENTE (obrigatório: use como ponto de partida ou como a grande reviravolta): ${semente || "livre"}
TEMPERO DE ESTRUTURA (use de algum jeito): ${tempero || "livre"}

COMO MONTAR O ARCO:
- Ato 1 (o começo): gancho forte já na primeira cena, apresenta o mundo, o problema e um NPC marcante (com nome, jeito e vontade própria). Termina com uma descoberta que muda o que o grupo achava.
- Ato 2 (o meio): complicação e escalada. O vilão reage ao grupo. Uma reviravolta (o segredo do ato) e o pior momento do grupo.
- Ato 3 (o fim): clímax com o vilão ou com a ameaça, uma escolha moral difícil e o desfecho.
- Amarre pelo menos um gancho ao antecedente, vínculo ou defeito de algum personagem.
- Cada ato tem: "nome" evocativo (2 a 4 palavras, sem spoiler); "objetivo" PÚBLICO em uma frase, do ponto de vista dos jogadores, dizendo só o que eles já sabem que precisam fazer (sem revelar segredos); "segredo", o que só o Mestre sabe; "cenas", a lista de cenas sugeridas na quantidade pedida pela duração, cada uma com "Lugar: situação".
- Ao longo da aventura, inclua ao menos um combate adequado a nível 1 (dê PV, CA, ataque e dano dos inimigos na cena), um desafio social e um de exploração ou investigação.
- Os objetivos podem ser cumpridos de vários jeitos (lutar, negociar, enganar, investigar, fugir). Nada de trilho.
- "desfechos": exatamente 3 frases — uma vitória, uma derrota e um meio-termo.

VARIEDADE E ORIGINALIDADE:
- Fuja do óbvio: nada de "um velho misterioso contrata vocês numa taverna" (a não ser que o tema peça muito), nada de vilão que é mau só por ser.
- Crie nomes próprios originais, sonoros e fáceis de dizer em voz alta (o jogo é narrado por voz).
- Propriedade intelectual: se o tema é inspirado numa obra protegida, use mundo, nomes, lugares e personagens ORIGINAIS que lembrem o clima dela — nunca personagens, lugares, feitiços, objetos ou termos próprios da obra. Figuras de domínio público citadas no tema podem aparecer.
- Escreva em português do Brasil.

Responda SOMENTE com JSON neste formato:
{"titulo":"nome da aventura (até 6 palavras)","premissa":"2 ou 3 frases","vilao":{"nome":"str","motivacao":"1 frase"},"atos":[{"nome":"str","objetivo":"str","segredo":"str","cenas":["Lugar: situação"]},{"nome":"str","objetivo":"str","segredo":"str","cenas":["..."]},{"nome":"str","objetivo":"str","segredo":"str","cenas":["..."]}],"desfechos":["Vitória: ...","Derrota: ...","Meio-termo: ..."]}`;
}

function blocoTema(t) {
  return `TEMA DA AVENTURA: ${t.nome} (${t.inspiracao}).
${t.ambientacao}
COMO OS PERSONAGENS EXISTEM NESTE TEMA: ${t.fichas} As regras não mudam (raça, classe, ataques e magias funcionam igual); só o nome, o sabor e a descrição seguem o tema.`;
}

function blocoArco(arco, ato, concluido, ajustes, duracao, narracoesNoAto) {
  if (!arco) return "ARCO DA HISTÓRIA: a aventura ainda não começou; o arco será criado na abertura.";
  const marca = (i) => (concluido || i + 1 < ato ? "JÁ CUMPRIDO" : i + 1 === ato ? "ATO ATUAL" : "AINDA POR VIR");
  const atos = arco.atos.slice(0, 3).map((a, i) => `ATO ${i + 1} — "${a.nome || NOMES_ATOS[i]}" [${marca(i)}]
  Objetivo (os jogadores sabem): ${a.objetivo || "(improvise)"}
  Segredo (só você sabe): ${a.segredo || "(improvise)"}
  Cenas sugeridas: ${(a.cenas || []).join(" | ") || "(improvise)"}`).join("\n");
  const d = DURACAO_TEXTO[duracao];
  const vilao = arco.vilao?.nome ? `${arco.vilao.nome}${arco.vilao.motivacao ? ` — ${arco.vilao.motivacao}` : ""}` : "(improvise um vilão coerente com o tema e mantenha-o)";
  const conducao = concluido
    ? `- A HISTÓRIA PRINCIPAL JÁ TERMINOU. Agora é epílogo: narre consequências, despedidas e pontas soltas e responda ao que os jogadores fizerem, sem abrir um arco novo. Não mande "ato" nem "fim". (O dono da mesa pode começar uma nova aventura quando quiser.)`
    : `- O arco é seu mapa secreto, não um roteiro: nunca o leia em voz alta, nunca revele um segredo antes de os jogadores o merecerem e nunca diga "ato 2" na narração — a virada se sente pela história.
- Conduza rumo ao OBJETIVO DO ATO ${ato} sem trilho: ofereça oportunidades, pistas, pressões e NPCs com vontades próprias. Soluções inesperadas (lutar, negociar, enganar, investigar, fugir) valem para cumprir o objetivo.
- As cenas sugeridas são opções: adapte, troque a ordem, pule, junte ou invente cenas novas.
- Escolhas mudam o caminho: quando uma decisão do grupo altera o que vem depois (um aliado morre, o vilão é poupado, um segredo é revelado cedo, o grupo muda de lado), adapte o meio e o fim e registre a mudança em "ajuste_arco", numa frase. Os ajustes valem mais que o plano original.
- Use o rumo desejado pelo grupo (se houver) para moldar o meio e o fim, sem quebrar o tom nem os vetos.
- Quando o objetivo do ato atual for cumprido, narre a virada (uma revelação, uma mudança de lugar, um novo perigo) e mande "ato": ${Math.min(ato + 1, 3)}${ato >= 3 ? " (no ato 3 não há próximo ato: use \"fim\")" : ""}. Um ato por vez; nunca pule atos.
- Ritmo: ${d.ritmo}${Number.isFinite(narracoesNoAto) ? ` Narrações neste ato até agora: ${narracoesNoAto}.` : ""}
- No ato 3, conduza ao clímax: o confronto com o vilão ou com a ameaça, uma escolha difícil e um desfecho satisfatório que reflita as escolhas e os ajustes (os desfechos possíveis, acima, são referência, não obrigação). Na narração do desfecho, mande "fim": true.`;
  return `ARCO DA HISTÓRIA (secreto — guie-se por ele):
Título: ${arco.titulo}
Premissa: ${arco.premissa || "(improvise)"}
Vilão: ${vilao}
${atos}
Desfechos possíveis: ${(arco.desfechos || []).join(" | ") || "(improvise)"}
${ajustes.length ? `AJUSTES JÁ FEITOS NO ARCO PELAS ESCOLHAS DO GRUPO (siga-os):\n${ajustes.map((x) => `* ${x}`).join("\n")}\n` : ""}
COMO CONDUZIR A HISTÓRIA:
${conducao}`;
}

/** Elementos visíveis da cena atual (lista de textos curtos guardada na mesa). */
function elementosDaCena(mesa) {
  const e = campoJson(mesa?.elementos);
  return Array.isArray(e) ? e.filter((x) => typeof x === "string" && x.trim()).slice(0, 8) : [];
}

function contexto(mesa, fichas, recentes) {
  const c = campoJson(mesa.combate);
  const ini = c ? c.inimigos.filter((i) => i.pv > 0).map((i) => `- ${i.nome} [id ${i.id}]: PV ${i.pv}/${i.pvMax}, CA ${i.ca}${c.mapa ? `, ${i.alcance === "distancia" ? "ataca à distância" : "corpo a corpo"}` : ""}`).join("\n") : "";
  const situacao = c?.mapa ? `\n${MP.descreverSituacao(c, fichas)}\nNarre de acordo com o mapa: quem está longe precisa se aproximar para lutar corpo a corpo, e obstáculos bloqueiam a visão.` : "";
  const log = recentes.map((e) => e.tipo === "narr" ? `MESTRE: ${e.texto}` : e.tipo === "acao" ? `${e.nome}: ${e.texto}` : `(${e.texto})`).join("\n");
  const tom = TOM_TEXTO[mesa.tom] || TOM_TEXTO.epico;
  const tema = T.temaPorId(mesa.tema);
  const duracao = T.duracaoValida(mesa.duracao);
  const arco = arcoEfetivo(mesa);
  const ato = numAto(mesa.ato);
  const concluido = !!Number(mesa.arcoConcluido);
  const ajustes = (campoJson(mesa.arcoAjustes) || []).filter((x) => typeof x === "string");
  // nomes do tema que aparecem nas fichas do grupo (raças e classes, sempre; ataques e magias de cada um)
  const nomes = blocoNomes(tema, [...Object.keys(tema.nomes.racas), ...Object.keys(tema.nomes.classes),
    ...fichas.flatMap((f) => [...(f.ataques || []), ...(f.magias || [])].map((x) => x.nome))]);
  return `${REGRAS}

${blocoTema(tema)}${nomes ? `\n${nomes}` : ""}

${blocoArco(arco, ato, concluido, ajustes, duracao, mesa._narracoesNoAto)}

CONTEXTO DA SESSÃO:
- Tema: ${tema.nome}
- Duração: ${DURACAO_TEXTO[duracao].nome}
${arco ? `- Ato atual: ${ato} de 3${concluido ? " (história concluída — epílogo)" : ""}\n` : ""}- Tom: ${tom}${mesa.vetos ? `\n- Temas vetados (nunca use): ${mesa.vetos}` : ""}${mesa.desejos ? `\n- Rumo da história desejado pelo grupo: ${mesa.desejos}` : ""}
- Personagens:
${fichas.map((f) => resumoFicha(f, tema)).join("\n") || "(sem personagens)"}
- Resumo: ${mesa.resumo || "(início da aventura)"}
- Dia na história: ${Math.max(1, Number(mesa.dia) || 1)}
- Cena atual: ${mesa.cena || "(ainda não definida)"}
- Elementos da cena atual (o que está visível e pode ser usado): ${elementosDaCena(mesa).join("; ") || "(só o que já foi narrado)"}
${c ? `\nEM COMBATE (rodada ${c.rodada}). Inimigos vivos:\n${ini}${situacao}` : "\nFora de combate."}
ÚLTIMOS ACONTECIMENTOS:
${log || "(nenhum ainda)"}

${FORMATO}`;
}

class ErroMestre extends Error {
  constructor(msg) { super(msg); this.name = "ErroMestre"; }
}

/** Lê o primeiro valor JSON da resposta: inteiro, dentro de um bloco ```, ou do primeiro { / [ ao último } / ]. */
function lerJson(texto) {
  const t = String(texto || "").trim();
  try { return JSON.parse(t); } catch {}
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (bloco) { try { return JSON.parse(bloco[1]); } catch {} }
  const ini = t.search(/[[{]/);
  const fim = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (ini >= 0 && fim > ini) { try { return JSON.parse(t.slice(ini, fim + 1)); } catch {} }
  throw new ErroMestre("JSON inválido na resposta");
}

const TEMPO_LIMITE_IA_MS = 90_000;

async function perguntar(apiKey, prompt, qualidade = "rapido", maxTokens = 3000, temperatura) {
  const model = qualidade === "caprichado"
    ? (process.env.MODELO_CAPRICHADO || "anthropic/claude-sonnet-5.5")
    : (process.env.MODELO_RAPIDO || "anthropic/claude-haiku-5.5");
  if (temperatura === undefined) temperatura = 0.7;

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const body = { model, messages: [{ role: "system", content: prompt }], max_tokens: maxTokens, temperature: temperatura };

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_IA_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://mesa-viva.local",
        "X-Title": "Mesa Viva",
      },
      body: JSON.stringify(body),
      signal: controle.signal,
    });
  } catch (e) {
    throw new ErroMestre(e.name === "AbortError" ? "O Mestre demorou demais para responder." : "Sem conexão com a IA.");
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 429 || res.status === 529) throw new ErroMestre("O Mestre está sobrecarregado. Tente de novo em alguns segundos.");
    if (res.status === 402) throw new ErroMestre("Créditos da IA esgotados.");
    console.error(`[IA] ${res.status} ${err.slice(0, 300)}`);
    throw new ErroMestre("O Mestre não respondeu. Tente de novo.");
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new ErroMestre("Resposta vazia da IA");
  return lerJson(text);
}

async function gerarImagem(apiKey, prompt, baseUrl, tentativa = 1, prefixo = "img") {
  if (tentativa > 3) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const modelos = ["google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image"];
  const modelo = modelos[Math.min(tentativa - 1, modelos.length - 1)];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://mesa-viva.local",
        "X-Title": "Mesa Viva",
      },
      body: JSON.stringify({ model: modelo, prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const e = await res.text().catch(() => "");
      if ([429, 502, 503].includes(res.status) || (res.status === 402 && tentativa >= modelos.length)) {
        await new Promise((r) => setTimeout(r, 2000));
        return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1, prefixo);
      }
      if (res.status === 402) {
        return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1, prefixo);
      }
      throw new ErroMestre(`Imagem: ${res.status} ${e.slice(0, 200)}`);
    }
    const data = await res.json();
    const item = data?.data?.[0];
    if (item?.url) return item.url;
    if (item?.b64_json) {
      const fs = require("fs");
      const path = require("path");
      const pubDir = path.join(__dirname, "public", "images");
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      const name = `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      const buf = Buffer.from(item.b64_json, "base64");
      fs.writeFileSync(path.join(pubDir, name), buf);
      const rel = `/images/${name}`;
      return baseUrl ? `${baseUrl}${rel}` : rel;
    }
    return "";
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1, prefixo);
    }
    throw new ErroMestre(`Imagem: ${e.message || e}`);
  }
}

    function _fallbackImage(conceito, baseUrl) {
      // Gera um SVG simples de placeholder temático quando a API de imagem falha
      const cor = ["#2a1a0a","#1a0a0a","#0a1a2a","#2a2a1a"][conceito.length % 4];
      const acento = ["#c8a050","#50c8a0","#a050c8","#50a0c8"][conceito.length % 4];
      const titulo = (conceito.split("—")[0] || conceito).trim().slice(0, 40);
      const fs = require("fs"), path = require("path");
      const pubDir = path.join(__dirname, "public", "images");
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      // Renderiza SVG no servidor — como não temos lib de imagem, salvamos SVG com .png
      // e deixamos o cliente tratar (navegadores exibem SVG com extensão PNG sem problemas)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cor}"/><stop offset="100%" stop-color="#0a0a0a"/>
        </linearGradient><linearGradient id="ac" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${acento}"/><stop offset="100%" stop-color="${cor}"/>
        </linearGradient></defs>
        <rect width="512" height="512" fill="url(#bg)"/>
        <circle cx="256" cy="256" r="180" fill="none" stroke="url(#ac)" stroke-width="3"/>
        <polygon points="256,96 160,192 352,192 256,288" fill="url(#ac)" opacity="0.3"/>
        <text x="256" y="140" text-anchor="middle" fill="${acento}" font-family="serif" font-size="22" font-weight="bold">${_escapeXml(titulo)}</text>
        <text x="256" y="400" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="14">Ilustração gerada por IA</text>
        <text x="256" y="420" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="12">créditos insuficientes — recarregue a conta</text>
      </svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      return dataUrl;
    }

    function _escapeXml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

const { mod, sinal, ATRIBUTOS, PERICIAS } = require("./regras");

module.exports = {
  REGRAS, FORMATO, CRICACAO, contexto, elementosDaCena, perguntar, gerarImagem, ErroMestre, resumoFicha, blocoNomes, lerJson,
  promptCriacao, promptImagem, promptImagemMapa, promptArco, normalizarArco, arcoPedraFunda, arcoMinimo, arcoEfetivo, arcoPublico, numAto,
};