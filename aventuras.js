/**
 * Biblioteca de aventuras do Mesa Viva. Todas se passam no mesmo mundo original e podem ser
 * jogadas em sequência com os mesmos personagens (a faixa de nível é só uma sugestão: os inimigos
 * se ajustam ao nível do grupo pela REFERÊNCIA DE INIMIGOS).
 *
 * Cada capítulo tem: titulo/objetivo (pt e en, mostrados no app), minutos (duração-alvo),
 * combate (nenhum | facil | comum | chefe) e ritmo (instrução para o Mestre).
 */
"use strict";

const cap = (titulo, tituloEn, objetivo, objetivoEn, minutos, combate, ritmo) => ({ titulo, tituloEn, objetivo, objetivoEn, minutos, combate, ritmo });

const AVENTURAS = [
  {
    id: "mina",
    titulo: "A Mina de Pedra-Funda", tituloEn: "The Deepstone Mine",
    resumo: "Goblins tomaram a mina de prata e seis mineiros sumiram. Uma aventura clássica para começar.",
    resumoEn: "Goblins have taken the silver mine and six miners are missing. A classic adventure to start with.",
    niveis: "1–4", duracao: "2 h a 2 h 30",
    cenario: "A Mina de Pedra-Funda (fantasia clássica, vila de Carvalho-Cinza)",
    cenaInicial: "Taverna Javali Cego", cenaInicialEn: "The Blind Boar Tavern",
    abertura: "coloque o grupo na taverna Javali Cego, quando Odila Ventoforte se aproxima",
    texto: `Aventura de uma sessão: "A Mina de Pedra-Funda" (mundo original, nível 1).
Gancho: na vila de Carvalho-Cinza, a mestra-mineira Odila Ventoforte contrata o grupo na taverna Javali Cego. Há dez dias goblins tomaram a mina de prata de Pedra-Funda e seis mineiros sumiram. Paga 50 peças de ouro por cabeça.
Cenas sugeridas (adapte às escolhas dos jogadores). Os números dos inimigos vêm da REFERÊNCIA DE INIMIGOS do contexto:
1. Taverna Javali Cego (sem combate): conversa com Odila e moradores; um teste fácil (CD 10 a 12) para a primeira pista: os goblins estão organizados demais e há relatos de um brilho verde na mina.
2. Trilha da pedreira: rastros (Sobrevivência CD 12) e uma emboscada de goblins: um inimigo COMUM por personagem, comportamento "covarde". É o primeiro combate: deixe o grupo vencer com estilo.
3. Entrada da mina: sentinelas goblins (LACAIOS, um por personagem; uma Furtividade CD 13 do grupo evita a luta) e uma armadilha de pedras soltas (Percepção CD 13 para notar; Destreza CD 12 para evitar 2d6).
4. Galerias: os mineiros presos em uma jaula; o elevador de carga quebrado (Atletismo CD 14 ou ideia criativa). Respiro: um bom lugar para o descanso curto.
5. Câmara do Cristal: o hobgoblin Garra-Torta (CHEFE, "chefe": true) e goblins capangas (COMUNS, um a menos que o número de personagens); um cristal verde sussurra promessas a ele. Destruir o cristal (CA 10, PV 10) faz os capangas fugirem.
Desfecho: resgatar os mineiros, decidir o que fazer com o cristal, recompensa de Odila (50 peças de ouro por cabeça, entregues na narração).`,
    capitulos: [
      cap("A taverna Javali Cego", "The Blind Boar Tavern", "Aceitar o trabalho de Odila e reunir pistas sobre a mina.", "Accept Odila's job and gather clues about the mine.", 15, "nenhum",
        "Cena social curta. Apresente Odila e um morador com uma pista cada. Peça no máximo um teste fácil. Feche o capítulo assim que o grupo aceitar o trabalho."),
      cap("A trilha da pedreira", "The Quarry Trail", "Seguir os rastros até a mina e sobreviver à emboscada.", "Follow the tracks to the mine and survive the ambush.", 25, "comum",
        "Primeiro combate da campanha: inimigos comuns, um por personagem. Ensine pelo exemplo (descreva o acerto, o erro, o crítico). Depois da luta, um respiro curto."),
      cap("A entrada da mina", "The Mine Entrance", "Passar pelas sentinelas e pela armadilha de pedras.", "Get past the sentries and the rockfall trap.", 25, "facil",
        "Escolha real: furtividade, conversa ou luta contra lacaios. A armadilha premia quem procura. Recompense ideias criativas."),
      cap("As galerias", "The Galleries", "Encontrar e libertar os mineiros presos.", "Find and free the captured miners.", 30, "comum",
        "Exploração e resgate. Um combate comum, no máximo. Ofereça o descanso curto antes da câmara do cristal e deixe os mineiros darem uma pista sobre Garra-Torta."),
      cap("A câmara do cristal", "The Crystal Chamber", "Enfrentar Garra-Torta e decidir o destino do cristal verde.", "Face Crookclaw and decide the fate of the green crystal.", 35, "chefe",
        "Clímax: chefe com capangas. Dê um objetivo além de bater (o cristal). Termine com a decisão sobre o cristal e marque capituloConcluido."),
    ],
  },
  {
    id: "feira",
    titulo: "A Feira dos Sete Ventos", tituloEn: "The Fair of Seven Winds",
    resumo: "Uma relíquia some no meio da maior feira do reino. Investigação, lábia e uma perseguição pelos telhados.",
    resumoEn: "A relic vanishes in the middle of the realm's biggest fair. Investigation, smooth talking and a rooftop chase.",
    niveis: "1–3", duracao: "2 h",
    cenario: "A Feira dos Sete Ventos (cidade mercante de Porto-Âmbar, intriga leve e humor)",
    cenaInicial: "Praça da Feira", cenaInicialEn: "Fair Square",
    abertura: "coloque o grupo na praça lotada da Feira dos Sete Ventos, em Porto-Âmbar, no instante em que o sino da guilda toca o alarme e a mestra de feira Benta Cata-Vento, aflita, corre até eles",
    texto: `Aventura de uma sessão: "A Feira dos Sete Ventos" (mundo original, níveis 1 a 3). Menos combate, mais investigação e conversa.
Gancho: em Porto-Âmbar, durante a feira anual, a Rosa dos Ventos de Bronze (relíquia que abre a feira e, dizem, acalma tempestades) some do pedestal em plena praça. A mestra de feira Benta Cata-Vento oferece 40 peças de ouro por cabeça e um favor da Guilda dos Mercadores para tê-la de volta antes do pôr do sol, sem escândalo.
Verdade por trás: o ladrão é Tico Dedo-Leve, um jovem halfling acrobata do circo, chantageado pelo agiota Mestre Sarro, que quer vender a relíquia ao capitão contrabandista Zé Maré-Baixa. Tico não é vilão: se tratado com jeito, ajuda.
Cenas sugeridas (adapte às escolhas). Os números dos inimigos vêm da REFERÊNCIA DE INIMIGOS:
1. Praça da Feira (sem combate): três testemunhas com versões diferentes (uma vendedora de especiarias, um guarda sonolento, uma criança que viu "alguém voando"). Investigação ou Percepção CD 11: marcas de giz de acrobata no pedestal.
2. O Circo das Lonas Azuis: ganhar a confiança da trupe (Atuação, Persuasão ou um número improvisado, CD 12) ou bisbilhotar (Furtividade CD 13). Descobrem que Tico sumiu e deve dinheiro.
3. Perseguição nos telhados: Tico foge. Sequência de 3 testes (Acrobacia, Atletismo, ideias criativas; CD 12 a 13). Falhar não encerra a cena: custa PV (1d4), tempo ou uma complicação engraçada. No fim, capangas do agiota (LACAIOS, um por personagem) chegam para pegar Tico: primeiro combate, fácil.
4. A casa de penhores de Mestre Sarro: fachada respeitável, cofre nos fundos. Entrar por lábia, disfarce, arrombamento (o minigame da fechadura) ou negociação. Guarda-costas (COMUNS, um por personagem) só se der errado. Respiro e descanso curto depois.
5. O cais ao pôr do sol: Zé Maré-Baixa (CHEFE, "chefe": true, comportamento "tatico") e marujos (LACAIOS) tentam zarpar com a relíquia. O grupo pode lutar, sabotar o barco, comprar a tripulação ou chamar a guarda. A maré e as cordas do cais são parte da cena.
Desfecho: devolver a relíquia a tempo (a feira abre com festa), decidir o destino de Tico e de Mestre Sarro. Recompensa de Benta entregue na narração.`,
    capitulos: [
      cap("O sumiço na praça", "The Vanishing in the Square", "Ouvir as testemunhas e achar a primeira pista do ladrão.", "Question the witnesses and find the first clue to the thief.", 20, "nenhum",
        "Cena de investigação leve e bem-humorada. Três testemunhas, três versões. Um teste fácil revela o giz de acrobata. Feche quando o grupo decidir ir ao circo."),
      cap("O Circo das Lonas Azuis", "The Blue Canvas Circus", "Descobrir quem é o acrobata e por que ele roubou.", "Find out who the acrobat is and why he stole.", 20, "nenhum",
        "Cena social. Deixe os jogadores improvisarem um número ou bisbilhotarem. A trupe protege Tico, mas está preocupada com ele."),
      cap("Correria nos telhados", "Rooftop Chase", "Alcançar Tico antes dos capangas do agiota.", "Catch Tico before the loan shark's thugs do.", 25, "facil",
        "Perseguição em 3 testes, com falhas divertidas e não punitivas. Termina com um combate fácil contra lacaios. Tico, salvo, conta sobre a chantagem."),
      cap("A casa de penhores", "The Pawnshop", "Entrar no cofre de Mestre Sarro e descobrir para onde foi a relíquia.", "Get into Master Sarro's vault and learn where the relic went.", 25, "comum",
        "Golpe: recompense planos criativos. Combate comum só se o plano falhar. O livro-caixa aponta para o cais. Ofereça o descanso curto."),
      cap("O cais ao pôr do sol", "The Docks at Sunset", "Recuperar a Rosa dos Ventos antes que o barco zarpe.", "Recover the Wind Rose before the ship sets sail.", 30, "chefe",
        "Clímax com relógio: o sol está baixando. Chefe tático com lacaios, mas há saídas sem luta. Termine com a relíquia de volta e marque capituloConcluido."),
    ],
  },
  {
    id: "farol",
    titulo: "O Farol das Marés Mortas", tituloEn: "The Lighthouse of Dead Tides",
    resumo: "O farol apagou e os mortos do naufrágio voltaram com a maré. Terror costeiro contra mortos-vivos.",
    resumoEn: "The lighthouse went dark and the shipwrecked dead came back with the tide. Coastal horror against the undead.",
    niveis: "3–6", duracao: "2 h 30",
    cenario: "O Farol das Marés Mortas (costa de Baía-Cinzenta, clima sombrio e chuvoso)",
    cenaInicial: "Vila de Baía-Cinzenta", cenaInicialEn: "Greybay Village",
    abertura: "coloque o grupo chegando à vila de pescadores de Baía-Cinzenta sob garoa, no fim da tarde, quando o velho faroleiro Anselmo Sal-Grosso, encharcado e trêmulo, pede ajuda na porta do armazém",
    texto: `Aventura de uma sessão: "O Farol das Marés Mortas" (mundo original, níveis 3 a 6). Tom de suspense; clima de chuva e neblina.
Gancho: há três noites a luz do farol de Baía-Cinzenta apagou sozinha. Desde então, a cada maré alta, afogados do naufrágio do navio Andorinha saem do mar e andam até a vila. O faroleiro Anselmo Sal-Grosso fugiu do farol e jura que "a chama foi roubada". O conselho da vila paga 80 peças de ouro por cabeça.
Verdade por trás: a chama do farol era uma brasa sagrada que mantinha os mortos em paz. A sacerdotisa renegada Irmã Vésper a levou para a gruta sob o farol, onde tenta trazer de volta o irmão, capitão do Andorinha. Ela não é má: está de luto e cega para o custo.
Cenas sugeridas (adapte às escolhas). Números dos inimigos pela REFERÊNCIA DE INIMIGOS. Mortos-vivos: fraqueza a sagrado, resistência a sombrio e veneno; afogados também resistem a gelo.
1. Vila de Baía-Cinzenta (sem combate): Anselmo, a taberneira Juna e pescadores assustados. Pistas (CD 12): os afogados não atacam quem está dentro de casa com luz acesa; todos usam o uniforme do Andorinha.
2. A maré alta: a vila é cercada ao anoitecer. Combate COMUM (um afogado por personagem) defendendo o armazém; proteger os moradores vale mais do que derrubar todos. Luz e fogo afastam os mortos (mas a chuva enfraquece o fogo).
3. A trilha das falésias e o farol: subida escorregadia (Atletismo ou Acrobacia CD 13; falha custa 1d6). Dentro, o diário do faroleiro e o mecanismo da lente quebrado. Um espectro do antigo faroleiro (ELITE, pode ser acalmado com Religião ou Persuasão CD 14 em vez de combatido).
4. A gruta sob o farol: túneis alagados com a maré subindo (relógio: a cada falha a água sobe). Enigma das três correntes do sino. Respiro num altar seco: descanso curto.
5. O altar da brasa: Irmã Vésper e o Capitão Afogado (CHEFE, "chefe": true, elemento sombrio, fraco contra sagrado) com afogados (LACAIOS). Devolver a brasa ao farol, convencer Vésper a soltar o irmão (teste difícil, CD 16, com vantagem se usarem o diário) ou destruir o capitão.
Desfecho: reacender o farol, decidir o destino de Vésper, recompensa do conselho entregue na narração.`,
    capitulos: [
      cap("A vila sob a garoa", "The Village in the Drizzle", "Ouvir o faroleiro e entender o que os afogados querem.", "Hear the keeper out and work out what the drowned want.", 15, "nenhum",
        "Suspense crescente, sem combate. Poucas falas, muito ambiente: chuva, sino da boia, janelas fechadas. Termine com o sino da maré alta."),
      cap("A maré alta", "High Tide", "Defender a vila até a maré baixar.", "Defend the village until the tide goes out.", 30, "comum",
        "Combate de defesa: um afogado por personagem. Dê valor a proteger moradores e usar luz. Depois, respiro curto e a decisão de subir ao farol."),
      cap("O farol apagado", "The Dark Lighthouse", "Subir a falésia e descobrir quem levou a chama.", "Climb the cliff and find out who took the flame.", 30, "facil",
        "Exploração tensa. O espectro pode ser acalmado em vez de combatido: recompense empatia. O diário aponta para a gruta."),
      cap("A gruta alagada", "The Flooded Cave", "Atravessar os túneis antes que a maré os feche.", "Cross the tunnels before the tide seals them.", 30, "comum",
        "Relógio de maré: cada falha sobe a água. Um combate comum, no máximo. Ofereça o descanso curto no altar seco."),
      cap("O altar da brasa", "The Ember Altar", "Recuperar a brasa sagrada e dar descanso aos mortos.", "Recover the sacred ember and lay the dead to rest.", 40, "chefe",
        "Clímax com dilema: Vésper está de luto, não é monstro. Chefe com lacaios, mas a conversa pode vencer. Termine com o farol aceso e marque capituloConcluido."),
    ],
  },
  {
    id: "inverno",
    titulo: "O Inverno de Vidro", tituloEn: "The Glass Winter",
    resumo: "No auge do verão, a geleira desceu a montanha em uma noite. Uma expedição ao coração do gelo.",
    resumoEn: "At the height of summer, the glacier came down the mountain in a single night. An expedition to the heart of the ice.",
    niveis: "5–9", duracao: "2 h 30 a 3 h",
    cenario: "O Inverno de Vidro (Serra do Espelho, passo de montanha congelado, tom épico)",
    cenaInicial: "Posto do Passo Alto", cenaInicialEn: "High Pass Outpost",
    abertura: "coloque o grupo no posto de guarda do Passo Alto, na Serra do Espelho, em pleno verão e sob neve grossa, quando a capitã Íris Ferro-Frio, com gelo nos cílios, estende um mapa sobre a mesa",
    texto: `Aventura de uma sessão longa: "O Inverno de Vidro" (mundo original, níveis 5 a 9). Tom épico; clima de neve.
Gancho: em pleno verão, uma geleira de gelo transparente como vidro desceu a Serra do Espelho em uma noite e fechou o Passo Alto, isolando três vilas. A capitã Íris Ferro-Frio paga 150 peças de ouro por cabeça para descobrir a causa e reabrir o passo.
Verdade por trás: o anão forjador Durgan Mão-de-Geada despertou o Coração do Inverno, uma joia antiga, para salvar a filha doente congelando-a no tempo. A joia saiu do controle e agora é guardada por Hialina, uma serpe de gelo jovem que a toma por ovo.
Cenas sugeridas (adapte às escolhas). Números pela REFERÊNCIA DE INIMIGOS. Criaturas de gelo: resistência ou imunidade a gelo, fraqueza a fogo.
1. Posto do Passo Alto (sem combate): Íris, batedores com queimaduras de frio e um mercador preso. Pistas (CD 13): o gelo cresce mais rápido à noite e "canta".
2. A travessia da geleira: fendas, vento cortante (salvaguardas de Constituição CD 13; falha causa 1d8 de gelo ou o status atordoado por 1 turno) e uma matilha de lobos de vidro (COMUNS, um por personagem, elemento gelo).
3. A vila congelada de Três-Chaminés: moradores presos em gelo, vivos. A forja de Durgan e seu diário. Estátuas de gelo animadas (LACAIOS em dobro) se o grupo quebrar algo; libertar uma pessoa exige fogo com cuidado (Medicina ou Arcanismo CD 14).
4. A Escada de Cristal: subida vertical por dentro da geleira (3 testes; CD 14). Durgan (ELITE, "tatico") enfrenta o grupo por desespero, mas se rende se ouvir que a filha pode ser salva. Respiro: descanso curto na forja portátil dele.
5. O ninho no topo: Hialina, a serpe de gelo (CHEFE, "chefe": true, elemento gelo, imune a gelo, fraca contra fogo, sopro que aplica atordoado) e o Coração do Inverno. Saídas: derrotar a serpe, trocar o "ovo" por outra coisa brilhante (Adestrar Animais ou Enganação CD 16), ou quebrar a joia (CA 14, PV 25), o que derrete tudo de uma vez e causa uma avalanche (salvaguardas).
Desfecho: o passo reabre, as vilas descongelam, o destino de Durgan, da filha e da serpe. Recompensa de Íris entregue na narração.`,
    capitulos: [
      cap("Neve em pleno verão", "Snow in Midsummer", "Aceitar a missão da capitã Íris e preparar a travessia.", "Accept Captain Iris's mission and prepare for the crossing.", 15, "nenhum",
        "Cena social curta e épica. Mostre a escala do desastre. Deixe o grupo se equipar e escolher a rota. Feche ao partirem."),
      cap("A geleira que canta", "The Singing Glacier", "Cruzar a geleira e sobreviver à matilha de vidro.", "Cross the glacier and survive the glass pack.", 30, "comum",
        "Perigo do ambiente primeiro, combate comum depois. O frio é um inimigo: use salvaguardas com moderação. Respiro ao avistar a vila."),
      cap("Três-Chaminés", "Three Chimneys", "Descobrir o que congelou a vila e quem começou tudo.", "Find out what froze the village and who started it all.", 30, "facil",
        "Mistério e compaixão: os moradores estão vivos no gelo. O combate (lacaios) só acontece por descuido. O diário de Durgan revela a filha doente."),
      cap("A Escada de Cristal", "The Crystal Stair", "Subir por dentro da geleira e confrontar Durgan.", "Climb through the glacier and confront Durgan.", 35, "comum",
        "Escalada em 3 testes e um duelo que pode virar conversa. Durgan é um pai desesperado. Ofereça o descanso curto antes do topo."),
      cap("O Coração do Inverno", "The Heart of Winter", "Deter o inverno e decidir o destino da serpe e da joia.", "Stop the winter and decide the fate of the wyvern and the jewel.", 45, "chefe",
        "Clímax épico com três saídas reais. A serpe protege um 'ovo', não é má. Termine com o degelo e marque capituloConcluido."),
    ],
  },
];

const PADRAO = "mina";

function aventura(id) {
  return AVENTURAS.find((a) => a.id === id) || AVENTURAS[0];
}

/** Aventura de uma mesa (mesas antigas, sem a coluna, usam a primeira). */
function daMesa(mesa) {
  return aventura(mesa?.aventura || PADRAO);
}

/** Lista para o app escolher, já no idioma pedido. */
function lista(idioma = "pt") {
  const en = idioma === "en";
  return AVENTURAS.map((a) => ({
    id: a.id,
    titulo: en ? a.tituloEn : a.titulo,
    resumo: en ? a.resumoEn : a.resumo,
    niveis: a.niveis,
    duracao: en ? a.duracao.replace(" a ", " to ") : a.duracao,
    capitulos: a.capitulos.length,
  }));
}

/** Capítulos de uma aventura no idioma pedido (mantém os campos de ritmo). */
function capitulos(a, idioma = "pt") {
  const en = idioma === "en";
  return a.capitulos.map((c) => ({ titulo: en ? c.tituloEn : c.titulo, objetivo: en ? c.objetivoEn : c.objetivo, minutos: c.minutos, combate: c.combate, ritmo: c.ritmo }));
}

module.exports = { AVENTURAS, PADRAO, aventura, daMesa, lista, capitulos };
