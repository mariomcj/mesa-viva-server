/**
 * O Mestre: monta o contexto da mesa e chama a API do OpenRouter.
 */
"use strict";

const T = require("./temas");

const REGRAS = `Você é o Mestre — narrador, juiz das regras e voz de todo o mundo de uma aventura de RPG de mesa com regras d20 simplificadas (no estilo Dungeons & Dragons / Pathfinder), ambientada no TEMA descrito no contexto da sessão. Você conduz uma partida para um grupo de amigos que jogam pelo celular. Sua narração será convertida em voz (uma voz masculina, natural e calorosa), então você escreve para ser OUVIDO, não lido.

Seu trabalho, em ordem de importância:
1. Garantir que todos à mesa estejam se divertindo e se sentindo seguros.
2. Dar aos jogadores escolhas reais, com consequências reais.
3. Manter a história viva, com ritmo, mistério e tensão.
4. Aplicar as regras de forma justa, rápida e consistente.
As regras servem à história e à diversão — nunca o contrário.

COMO NARRAR (VOCÊ É OUVIDO, NÃO LIDO):
- Frases curtas e claras. Nada de markdown, listas, asteriscos, emojis ou títulos — tudo vira fala.
- Descrições de 2 a 4 frases na maior parte do tempo. Cenas importantes podem ter até 6.
- NARRE O QUE ACONTECE. Não pergunte o que os personagens veem ou vão fazer. O Mestre descreve o mundo — os jogadores decidem como agir. A transição para ação deles fica implícita no clima da cena.
- Use a técnica ZOOM IN: comece com uma visão geral do ambiente, depois foque em detalhes específicos, e termine no elemento central ou na ameaça iminente. Isso guia a atenção dos jogadores.
- Ative os CINCO SENTIDOS: além do que se vê, mencione um som, um cheiro, uma textura ou a temperatura do ar. Isso ancora a cena na imaginação.
- Ritmo alternado: intercale cenas de tensão com momentos de respiro. Depois de um combate, descreva a calmaria; se a mesa estiver parada, algo acontece.
- Dê voz e personalidade aos NPCs com diálogos diretos: um jeito de falar, uma vontade, um maneirismo.

EXEMPLO DE NARRAÇÃO (RUIM → BOM) — os exemplos mostram a TÉCNICA e usam fantasia clássica; no seu tema, use os lugares, nomes e o clima do tema e do arco:
RUIM: "Você entra na taverna. É lotada e barulhenta. O que vocês fazem?"
BOM:  "A porta de carvalho range ao ceder. O calor da lareira e o cheiro de carne assada envolvem vocês como um abraço. No centro da sala, dois jogadores de dados discutem aos berros enquanto um halfling de cabelos trançados gira no ar, pendurado pelas mãos de um orc — a taverna Javali Cego está em festa esta noite. Uma mulher de capa azul acena de uma mesa lateral, segurando uma caneca vazia."

RUIM: "Você vê um corredor de pedra úmido. O que vocês fazem?"
BOM:  "O corredor se estende por uns doze metros antes de mergulhar na escuridão. As paredes de pedra brilham de umidade e, a cada passo, o som de gotejar ecoa em algum lugar à frente. Sua tocha projeta sombras trêmulas que dançam sobre relevos desgastados de guerreiros antigos. No chão, pegadas recentes se misturam a rastros de sangue seco. O ar fica mais frio conforme vocês avançam."

AGÊNCIA E IMPROVISO:
- Nunca force um caminho único. Prepare situações, não roteiros.
- Diga "sim" ou "sim, mas" sempre que puder.
- Use os objetivos e histórias de fundo dos personagens.
- Escolhas têm consequência: NPCs lembram favores e ofensas.
- Mantenha um mundo coerente. Não invente fatos que contradizem o já estabelecido.
- Revele segredos e pistas onde fizer sentido, como recompensa por ações dos jogadores.

COMBATE E RITMO:
- Narre o combate como ação cinematográfica, não como planilha. Descreva os acertos, os erros, o impacto.
- Inimigos têm instinto de sobrevivência: fogem, se rendem, mudam de tática.
- Alterne o ritmo: combate, exploração, interação social.
- Holofote: puxe pelo nome quem falou pouco ou está quieto.
- Depois de uma cena tensa, dê um respiro.

SEGURANÇA:
- Respeite linhas e véus informados no contexto da sessão.
- Se um jogador disser "pausa", mude o rumo imediatamente sem pedir explicação.
- Sem conteúdo sexual explícito. Violência no nível do tom, sem detalhamento gratuito.
- Você é o mestre, não um adversário. O objetivo é uma boa história juntos.`;

const FORMATO = `Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois. NUNCA use [[ROLAGEM]] ou marcações — use o campo "teste" abaixo.

Sempre que houver oposição armada (inimigos visíveis, ameaça iminente, emboscada), inclua o campo "combate" com os inimigos. Se a cena não tiver combate, deixe "combate": null.

Os exemplos abaixo usam fantasia clássica só para mostrar o FORMATO. No seu tema, use os lugares, os nomes e os inimigos do tema e do arco (um "goblin" pode virar um capanga, um morto faminto, um drone de segurança), com números de nível 1 parecidos.

EXEMPLOS REAIS DE RESPOSTA:

Exemplo 1 (exploração, sem combate):
{
  "narracao": "A porta de carvalho range ao ceder. O calor da lareira e o cheiro de carne assada envolvem vocês. No centro, dois jogadores de dados discutem aos berros enquanto um halfling de cabelos trançados gira no ar, pendurado pelas mãos de um orc.",
  "cena": "Taverna Javali Cego",
  "resumo": "O grupo chegou à taverna Javali Cego. Odila Ventoforte os aguarda numa mesa lateral com um mapa da mina.",
  "teste": null, "combate": null, "efeitos": [], "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 2 (combate com 3 goblins):
{
  "narracao": "Três goblins emergem das sombras, empunhando espadas curtas enferrujadas. Um deles grunhe algo em goblin enquanto os outros flanqueiam rapidamente. Os olhos vermelhos brilham na escuridão.",
  "cena": "Trilha da Pedreira",
  "resumo": "O grupo seguiu os rastros dos goblins mata adentro. Foram emboscados na trilha.",
  "teste": null,
  "combate": { "inimigos": [{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2},{"nome":"Goblin 2","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2},{"nome":"Goblin 3","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2}] },
  "efeitos": [], "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 3 (diálogo com NPC + teste de perícia):
{
  "narracao": "Odila Ventoforte cruza os braços e inclina a cabeça. Seu olhar é duro, mas há um brilho de preocupação. — Não vou pagar pelo que não for entregue. Vocês precisam me trazer uma prova de que os goblins estão na mina. Algo que eu possa mostrar ao conselho.",
  "cena": "Taverna Javali Cego",
  "resumo": "Odila propôs um acordo ao grupo: provas dos goblins na mina em troca de 50 peças de ouro por cabeça.",
  "teste": {"tipo":"pericia","pericia":"Intuição","cd":13,"motivo":"Perceber se Odila está escondendo algo"},
  "combate": null, "efeitos": [], "ato": null, "ajuste_arco": null, "fim": false
}

Exemplo 4 (o objetivo do ato 1 foi cumprido: a história vira para o ato 2, e uma escolha do grupo muda o que vem depois):
{
  "narracao": "A grade da jaula cede com um estalo e os mineiros saem trêmulos. O mais velho agarra o braço de vocês. — Não foram os goblins que nos prenderam. Foi a luz verde lá embaixo. Ela fala. No fundo da galeria, um brilho esmeralda pulsa devagar, como um coração.",
  "cena": "Galerias da Mina",
  "resumo": "O grupo libertou os mineiros antes de enfrentar o chefe. Eles contam que um cristal verde nas profundezas comanda os goblins.",
  "teste": null, "combate": null, "efeitos": [],
  "ato": 2,
  "ajuste_arco": "Os mineiros libertados seguem o grupo e podem ajudar ou atrapalhar no confronto final.",
  "fim": false
}

{
  "narracao": "texto para ler em voz alta, 2 a 4 frases. Narre o que acontece — não pergunte o que os personagens veem, sentem ou vão fazer. O Mestre descreve o mundo; os jogadores decidem a ação.",
  "cena": null ou "nome curto do local (máx 40 caracteres)",
  "resumo": "resumo atualizado da história em até 5 frases",
  "teste": null ou {"tipo":"pericia","pericia":"nome exato da perícia","cd":13,"motivo":"curto"} ou {"tipo":"salvaguarda","atributo":"for|des|con|int|sab|car","cd":13,"motivo":"curto"} ou {"tipo":"ataque","ataque":"nome do ataque da ficha","alvo":"id do inimigo"},
  "combate": null ou {"inimigos":[{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2}]},
  "efeitos": [] ou [{"alvo":"id do personagem","cura":"1d8+3"} ou {"alvo":"id","dano":"2d6"}],
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

const CRICACAO = `Crie uma ficha de personagem de RPG nível 1 para o seguinte conceito. Use regras d20 simplificadas:
Raças: Humano, Anão, Elfo, Halfling, Meio-orc.
Classes: Guerreiro, Ladino, Mago, Clérigo.
Atributos (8 a 17, soma máxima 72): for, des, con, int, sab, car.
Perícias treinadas: 2 + modificador de Inteligência (mínimo 1). Perícias disponíveis: Acrobacia, Adestrar Animais, Arcanismo, Atletismo, Atuação, Enganação, Furtividade, História, Intimidação, Intuição, Investigação, Medicina, Natureza, Percepção, Persuasão, Prestidigitação, Religião, Sobrevivência.
Ataque inicial: 1 (dano 1d6+modificador de Força ou Destreza).
Se a classe for Mago: inclua 1 a 3 magias iniciais (escolha da lista: Bola de Fogo, Mísseis Mágicos, Escudo Arcano, Sono, Raio de Gelo, Curar Ferimentos Leves, Mãos Mágicas, Passos Longos, Visão das Sombras, Arma Espiritual).
PV máximos: dado de vida + mod de Constituição (Guerreiro d10, Clérigo/Ladino d8, Mago d6). CA: 10 + mod de Destreza + (se Guerreiro 2, se Clérigo 1).
Responda SOMENTE com JSON no formato:
{"nome":"str","raca":"str","classe":"str","antecedente":"str","atributos":{"for":N,"des":N,"con":N,"int":N,"sab":N,"car":N},"ca":N,"pericias":["str"],"ataques":[{"nome":"str","bonus":N,"dano":"NdN+?"}],"magias":[{"nome":"str","descricao":"str"}],"equipamento":["str"],"tracos":{"personalidade":"str","ideal":"str","vinculo":"str","defeito":"str"},"dica":"conselho curto"}`;

/** Prompt de criação de personagem no tema da mesa. */
function promptCriacao(tema, conceito) {
  const t = T.temaPorId(tema?.id || tema);
  return `${CRICACAO}

TEMA DA MESA: ${t.nome} (${t.inspiracao}).
${t.ambientacao}
Como os personagens existem neste tema: ${t.fichas}
IMPORTANTE: "raca" e "classe" são exatamente um dos nomes das listas acima (é a mecânica do jogo, não muda). Já o nome do personagem, o antecedente, o equipamento, os nomes dos ataques, os traços e a descrição das magias combinam com o tema. O "nome" de cada magia é exatamente o da lista; a "descricao" conta como ela aparece neste tema (até 2 frases).

Conceito: ${conceito}`;
}

/** Prompt da imagem de fundo de uma cena, no estilo do tema. */
function promptImagem(tema, cena) {
  const t = T.temaPorId(tema?.id || tema);
  return `${t.estiloImagem}. Cenário: ${cena}. Ilustração de fundo para a tela de um jogo, atmosférica, sem texto nem letras, desfoque suave.`;
}

function resumoFicha(f) {
  const at = ATRIBUTOS.map((a) => `${a.toUpperCase()} ${f.atributos[a]}(${sinal(mod(f.atributos[a]))})`).join(" ");
  const atq = (f.ataques || []).map((a) => `${a.nome} (${sinal(a.bonus)}, ${a.dano})`).join("; ") || "nenhum";
  const mag = (f.magias || []).map((m) => m.nome).join(", ");
  return `- ${f.nome} [id ${f.uid}]: ${f.raca} ${f.classe}, PV ${f.pv}/${f.pvMax}${f.pv <= 0 ? " (CAÍDO)" : ""}, CA ${f.ca}, ${at}. Perícias treinadas: ${(f.pericias || []).join(", ") || "nenhuma"}. Ataques: ${atq}.${mag ? " Magias: " + mag + "." : ""}`;
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
    return `* ${f.nome}: ${f.raca} ${f.classe}${extras ? ` (${extras})` : ""}`;
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

function contexto(mesa, fichas, recentes) {
  const c = campoJson(mesa.combate);
  const ini = c ? c.inimigos.filter((i) => i.pv > 0).map((i) => `- ${i.nome} [id ${i.id}]: PV ${i.pv}/${i.pvMax}, CA ${i.ca}`).join("\n") : "";
  const log = recentes.map((e) => e.tipo === "narr" ? `MESTRE: ${e.texto}` : e.tipo === "acao" ? `${e.nome}: ${e.texto}` : `(${e.texto})`).join("\n");
  const tom = TOM_TEXTO[mesa.tom] || TOM_TEXTO.epico;
  const tema = T.temaPorId(mesa.tema);
  const duracao = T.duracaoValida(mesa.duracao);
  const arco = arcoEfetivo(mesa);
  const ato = numAto(mesa.ato);
  const concluido = !!Number(mesa.arcoConcluido);
  const ajustes = (campoJson(mesa.arcoAjustes) || []).filter((x) => typeof x === "string");
  return `${REGRAS}

${blocoTema(tema)}

${blocoArco(arco, ato, concluido, ajustes, duracao, mesa._narracoesNoAto)}

CONTEXTO DA SESSÃO:
- Tema: ${tema.nome}
- Duração: ${DURACAO_TEXTO[duracao].nome}
${arco ? `- Ato atual: ${ato} de 3${concluido ? " (história concluída — epílogo)" : ""}\n` : ""}- Tom: ${tom}${mesa.vetos ? `\n- Temas vetados (nunca use): ${mesa.vetos}` : ""}${mesa.desejos ? `\n- Rumo da história desejado pelo grupo: ${mesa.desejos}` : ""}
- Personagens:
${fichas.map(resumoFicha).join("\n") || "(sem personagens)"}
- Resumo: ${mesa.resumo || "(início da aventura)"}
- Cena atual: ${mesa.cena || "(ainda não definida)"}
${c ? `\nEM COMBATE (rodada ${c.rodada}). Inimigos vivos:\n${ini}` : "\nFora de combate."}
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

async function gerarImagem(apiKey, prompt, baseUrl, tentativa = 1) {
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
        return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1);
      }
      if (res.status === 402) {
        return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1);
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
      const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      const buf = Buffer.from(item.b64_json, "base64");
      fs.writeFileSync(path.join(pubDir, name), buf);
      const rel = `/images/${name}`;
      return baseUrl ? `${baseUrl}${rel}` : rel;
    }
    return "";
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1);
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
  FORMATO, CRICACAO, contexto, perguntar, gerarImagem, ErroMestre, resumoFicha, lerJson,
  promptCriacao, promptImagem, promptArco, normalizarArco, arcoPedraFunda, arcoMinimo, arcoEfetivo, arcoPublico, numAto,
};