/**
 * Tradução das mensagens do servidor para inglês.
 *
 * O jogo guarda tudo em português (é a língua das regras e do banco). Quando o aparelho pede
 * inglês (cabeçalho X-Idioma: en), as mensagens de sistema, os erros e os nomes do catálogo
 * são traduzidos na saída. A narração do Mestre não passa por aqui: ela já é escrita no idioma
 * da mesa. O que não tiver tradução sai em português, nunca quebra.
 */
"use strict";

const AV = require("./aventuras");

const NOMES = {
  // Elementos
  "Físico": "Physical", "Fogo": "Fire", "Gelo": "Ice", "Raio": "Lightning", "Sagrado": "Holy", "Sombrio": "Shadow", "Veneno": "Poison",
  // Raridades
  "Comum": "Common", "Incomum": "Uncommon", "Raro": "Rare", "Épico": "Epic", "Lendário": "Legendary",
  // Clima e período
  "Céu limpo": "Clear sky", "Chuva": "Rain", "Neblina": "Fog", "Neve": "Snow", "Tempestade": "Storm", "Vento forte": "Strong wind",
  "Manhã": "Morning", "Tarde": "Afternoon", "Anoitecer": "Dusk", "Noite": "Night", "Madrugada": "Late night", "Amanhecer": "Dawn",
  // Status
  "Envenenado": "Poisoned", "Em chamas": "Burning", "Sangrando": "Bleeding", "Atordoado": "Stunned", "Protegido": "Shielded", "Regenerando": "Regenerating", "Abençoado": "Blessed",
  // Atributos
  "Força": "Strength", "Destreza": "Dexterity", "Constituição": "Constitution", "Inteligência": "Intelligence", "Sabedoria": "Wisdom", "Carisma": "Charisma",
  // Classes e raças
  "Guerreiro": "Fighter", "Ladino": "Rogue", "Mago": "Wizard", "Clérigo": "Cleric",
  "Humano": "Human", "Anão": "Dwarf", "Elfo": "Elf", "Halfling": "Halfling", "Meio-orc": "Half-orc",
  // Perícias
  "Acrobacia": "Acrobatics", "Adestrar Animais": "Animal Handling", "Arcanismo": "Arcana", "Atletismo": "Athletics", "Atuação": "Performance",
  "Enganação": "Deception", "Furtividade": "Stealth", "História": "History", "Intimidação": "Intimidation", "Intuição": "Insight",
  "Investigação": "Investigation", "Medicina": "Medicine", "Natureza": "Nature", "Percepção": "Perception", "Persuasão": "Persuasion",
  "Prestidigitação": "Sleight of Hand", "Religião": "Religion", "Sobrevivência": "Survival",
  // Itens gerados
  "Lâmina": "Blade", "Machadinha": "Hatchet", "Maça": "Mace", "Arco": "Bow", "Cajado": "Staff", "Adaga": "Dagger",
  "Gibão": "Jerkin", "Cota": "Mail", "Brunea": "Brigandine", "Manto": "Cloak", "Elmo": "Helm", "Escudo": "Shield",
  "Amuleto": "Amulet", "Anel": "Ring", "Talismã": "Talisman", "Broche": "Brooch", "Pingente": "Pendant", "Medalhão": "Medallion",
  "Ardente": "Blazing", "Gélido": "Frozen", "Trovejante": "Thundering", "Bento": "Blessed", "Peçonhento": "Venomous",
  // Ataques padrão
  "Espada longa": "Longsword", "Golpe de escudo": "Shield bash", "Arco curto": "Shortbow", "Centelha Arcana": "Arcane Spark", "Martelo": "Hammer", "Luz Sagrada": "Sacred Light",
};

// Títulos e objetivos dos capítulos e das aventuras.
const EXATOS = {};
for (const a of AV.AVENTURAS) {
  EXATOS[a.titulo] = a.tituloEn; EXATOS[a.cenaInicial] = a.cenaInicialEn;
  for (const c of a.capitulos) { EXATOS[c.titulo] = c.tituloEn; EXATOS[c.objetivo] = c.objetivoEn; }
}

Object.assign(EXATOS, {
  // Erros
  "A subclasse fica disponível no nível 3.": "The subclass unlocks at level 3.",
  "API key não configurada.": "The server has no AI key configured.",
  "Atributo inválido.": "Invalid attribute.",
  "Autenticação necessária.": "Sign-in required.",
  "Aventura não começou.": "The adventure has not started.",
  "Combate pausado. Retome para agir.": "Combat is paused. Resume it to act.",
  "Comece a aventura primeiro.": "Start the adventure first.",
  "Crie pelo menos um personagem.": "Create at least one character.",
  "Crie seu personagem para votar.": "Create your character to vote.",
  "Crie seu personagem.": "Create your character.",
  "Código inválido.": "Invalid code.",
  "Descreva a imagem.": "Describe the image.",
  "Descreva seu personagem.": "Describe your character.",
  "Diga o que faz.": "Say what you do.",
  "Email e senha obrigatórios.": "Email and password are required.",
  "Email inválido.": "Invalid email.",
  "Email já cadastrado.": "That email is already registered.",
  "Email ou senha incorretos.": "Wrong email or password.",
  "Erro ao registrar.": "Could not sign up.",
  "Erro ao salvar reação.": "Could not save the reaction.",
  "Escolha inválida.": "Invalid choice.",
  "Esse item já está no máximo que o ferreiro alcança.": "This item is already as good as the blacksmith can make it.",
  "Há uma rolagem pendente.": "There is a pending roll.",
  "Inventário cheio (8 itens). Dispense um item na ficha antes.": "Inventory full (8 items). Sell an item on your sheet first.",
  "Item não encontrado.": "Item not found.",
  "Já existe uma expedição em andamento.": "An expedition is already under way.",
  "Mesa cheia.": "The table is full.",
  "Mesa não encontrada.": "Table not found.",
  "Muitas requisições. Aguarde um minuto.": "Too many requests. Wait a minute.",
  "Nenhum aumento de atributo disponível agora.": "No attribute increase available right now.",
  "Nenhum talento disponível agora.": "No talent available right now.",
  "No combate, a poção só pode ser tomada na sua vez.": "In combat, you can only drink a potion on your turn.",
  "Nome obrigatório.": "Name is required.",
  "Não autenticado.": "Not signed in.",
  "Não consegui criar a mesa.": "Could not create the table.",
  "Não dá para descansar durante o combate.": "You cannot rest during combat.",
  "Não dá para descansar na taverna durante o combate.": "You cannot rest at the tavern during combat.",
  "Não dá para redistribuir durante o combate.": "You cannot redistribute points during combat.",
  "Não encontrado.": "Not found.",
  "Não foi possível gerar a imagem.": "Could not generate the image.",
  "Não há combate ativo.": "There is no active combat.",
  "Não há rolagem pendente para você.": "There is no pending roll for you.",
  "Não há saque para você.": "There is no loot for you.",
  "Não há votação aberta.": "There is no open vote.",
  "O d20 vai de 1 a 20.": "The d20 goes from 1 to 20.",
  "O ferreiro não trabalha no meio de uma luta.": "The blacksmith does not work in the middle of a fight.",
  "Opção inválida.": "Invalid option.",
  "Personagem caído precisa de cura antes.": "A downed character needs healing first.",
  "Personagem não encontrado.": "Character not found.",
  "Ponto de salvamento não encontrado.": "Save point not found.",
  "Produto inválido.": "Invalid product.",
  "Resolva a rolagem pendente antes.": "Resolve the pending roll first.",
  "Salve fora do combate e sem rolagem pendente.": "Save outside combat and with no pending roll.",
  "Senha deve ter no mínimo 4 caracteres.": "The password needs at least 4 characters.",
  "Seus PV já estão cheios.": "Your HP is already full.",
  "Sua ação já está sendo processada.": "Your action is already being processed.",
  "Subclasse inválida.": "Invalid subclass.",
  "Só o dono pode reiniciar.": "Only the table owner can restart.",
  "Só quem criou a mesa apaga um jogo salvo.": "Only the table owner can delete a saved game.",
  "Só quem criou a mesa carrega um jogo salvo.": "Only the table owner can load a saved game.",
  "Só quem criou a mesa inicia uma expedição.": "Only the table owner can start an expedition.",
  "Só quem criou a mesa pede o epílogo.": "Only the table owner can ask for the epilogue.",
  "Só quem criou a mesa salva o jogo.": "Only the table owner can save the game.",
  "Só quem criou a mesa escolhe a aventura.": "Only the table owner can pick the adventure.",
  "Termine a aventura atual antes de começar outra.": "Finish the current adventure before starting another.",
  "Aventura inválida.": "Invalid adventure.",
  "Talento inválido.": "Invalid talent.",
  "Termine o que está acontecendo antes.": "Finish what is happening first.",
  "Tipo inválido.": "Invalid type.",
  "Token inválido.": "Invalid token.",
  "Usuário não encontrado.": "User not found.",
  "Usuário ou senha inválidos.": "Invalid user or password.",
  "Você já fez o descanso curto deste capítulo.": "You already took this chapter's short rest.",
  "Você não tem poções.": "You have no potions.",
  "Você não tem saque para revirar.": "You have no loot to reroll.",
  "Você não é membro desta mesa.": "You are not a member of this table.",
  "Sobrecarregado": "The Game Master is overloaded. Try again in a moment.",
  // Créditos
  "Os créditos desta mesa acabaram. Quem criou a mesa pode comprar mais na Loja, em Ajustes.": "This table is out of credits. The table owner can buy more in the Store, under Settings.",
  "Resta menos de 1 hora de mesa. Se acabar no meio de uma luta, ela termina por nossa conta.": "Less than 1 hour of play left. If it runs out mid-fight, we cover the rest of the fight.",
  // Diário
  "(narração indisponível)": "(narration unavailable)",
  "A aventura foi concluída! Quem criou a mesa pode pedir o epílogo na aba Mesa.": "The adventure is complete! The table owner can ask for the epilogue on the Table tab.",
  "Epílogo": "Epilogue",
  "Jogo salvo.": "Game saved.",
  "O grupo caiu. O combate terminou em derrota.": "The party has fallen. The fight ended in defeat.",
  "O grupo descansa e recupera as forças.": "The party rests and recovers.",
  "Saque! Cada um escolhe 1 entre 3 itens na aba Mesa.": "Loot! Everyone picks 1 of 3 items on the Table tab.",
  "Um baú! Cada um escolhe 1 entre 3 itens na aba Mesa.": "A chest! Everyone picks 1 of 3 items on the Table tab.",
  "⏵ Combate retomado.": "⏵ Combat resumed.",
  "⏸ Combate pausado.": "⏸ Combat paused.",
  "Turno dos inimigos processado (narração indisponível).": "Enemy turn resolved (narration unavailable).",
  "Aventura concluída.": "Adventure complete.",
  "Vitória!": "Victory!",
});

const n = (s) => NOMES[s] || NOMES[s.charAt(0).toUpperCase() + s.slice(1)]?.toLowerCase() || s;
const x = (s) => EXATOS[s] || s;
const SALAS = { "monstros": "monsters", "o chefe do andar": "the floor boss", "um baú": "a chest", "uma armadilha": "a trap", "um lugar seguro para descansar": "a safe place to rest" };

/** Nome de item gerado: "Lâmina Ardente" → "Blazing Blade"; "Cota Raro" → "Rare Mail". */
function nomeItem(nome) {
  const m = /^(\S+) (\S+)$/.exec(nome || "");
  if (m && NOMES[m[1]] && NOMES[m[2]]) return `${NOMES[m[2]]} ${NOMES[m[1]]}`;
  return NOMES[nome] || nome;
}

// Frases inteiras, da mais específica para a mais geral.
const PADROES = [
  [/^Vez de (.+)\.$/, (m) => `${m[1]}'s turn.`],
  [/^(.+) age primeiro\.$/, (m) => `${m[1]} acts first.`],
  [/^Combate! Iniciativa: (.+)$/, (m) => `Combat! Initiative: ${m[1]}`],
  [/^Vitória! (.+) fugiu\.$/, (m) => `Victory! ${m[1]} fled.`],
  [/^A sessão começou\. Capítulo 1: (.+?)\. Objetivo: (.+)$/, (m) => `The session has begun. Chapter 1: ${x(m[1])}. Goal: ${x(m[2])}`],
  [/^Nova aventura: (.+?)\. Capítulo 1: (.+?)\. Objetivo: (.+)$/, (m) => `New adventure: ${x(m[1])}. Chapter 1: ${x(m[2])}. Goal: ${x(m[3])}`],
  [/^Capítulo (\d+) concluído: (.*)\.$/, (m) => `Chapter ${m[1]} complete: ${x(m[2])}.`],
  [/^Capítulo (\d+): (.+?)\. Objetivo: (.+) \((.+), (.+)\)\.$/, (m) => `Chapter ${m[1]}: ${x(m[2])}. Goal: ${x(m[3])} (${n(m[4])}, ${n(m[5])}).`],
  [/^\+(\d+) XP: (.+)\.$/, (m) => `+${m[1]} XP: ${({ "capítulo concluído": "chapter complete", "vitória": "victory", "aventura concluída": "adventure complete", "epílogo": "epilogue" })[m[2]] || m[2]}.`],
  [/^(.+) subiu para o nível (\d+)! PV máximo (\d+), proficiência \+(\d+)\.(?: Escolha na ficha: (.+)\.)?$/, (m) => `${m[1]} reached level ${m[2]}! Max HP ${m[3]}, proficiency +${m[4]}.${m[5] ? ` Choose on your sheet: ${m[5].replace("um talento", "a talent").replace("a subclasse", "the subclass").replace("+1 atributo", "+1 attribute")}.` : ""}`],
  [/^(.+) aprendeu o talento (.+)\.$/, (m) => `${m[1]} learned the talent ${m[2]}.`],
  [/^(.+) seguiu o caminho: (.+)\.$/, (m) => `${m[1]} took the path: ${m[2]}.`],
  [/^(.+) aumentou (.+) para (\d+)\.$/, (m) => `${m[1]} raised ${n(m[2])} to ${m[3]}.`],
  [/^(.+) redistribuiu os pontos \(custo: (\d+) de ouro\)\.$/, (m) => `${m[1]} redistributed their points (cost: ${m[2]} gold).`],
  [/^(.+) redistribuiu os pontos \(a primeira vez é grátis\)\.$/, (m) => `${m[1]} redistributed their points (the first time is free).`],
  [/^(.+) ficou com (.+) \((.+)\)\.$/, (m) => `${m[1]} took ${nomeItem(m[2])} (${n(m[3])}).`],
  [/^(.+) bebeu uma poção e recuperou (\d+) PV \((.+)\)\.$/, (m) => `${m[1]} drank a potion and recovered ${m[2]} HP (${m[3]}).`],
  [/^(.+) fez um descanso curto e recuperou (\d+) PV \((.+)\)\.$/, (m) => `${m[1]} took a short rest and recovered ${m[2]} HP (${m[3]}).`],
  [/^(.+) passou a noite na taverna e acordou renovado \((\d+) de ouro\)\.$/, (m) => `${m[1]} spent the night at the tavern and woke up refreshed (${m[2]} gold).`],
  [/^(.+) comprou uma poção de cura \((\d+) de ouro\)\.$/, (m) => `${m[1]} bought a healing potion (${m[2]} gold).`],
  [/^O ferreiro melhorou (.+): agora é (.+) \((.+), (\d+) de ouro\)\.$/, (m) => `The blacksmith improved ${nomeItem(m[1])}: it is now ${nomeItem(m[2])} (${n(m[3])}, ${m[4]} gold).`],
  [/^(.+) revirou o saque atrás de algo melhor \((\d+) de ouro\)\.$/, (m) => `${m[1]} dug through the loot for something better (${m[2]} gold).`],
  [/^(.+) foi derrotado\.$/, (m) => `${m[1]} was defeated.`],
  [/^(.+) foge do combate\.$/, (m) => `${m[1]} flees the fight.`],
  [/^(.+) está atordoado e perde a vez\.$/, (m) => `${m[1]} is stunned and loses the turn.`],
  [/^(.+) não está mais (.+)\.$/, (m) => `${m[1]} is no longer ${n(m[2])}.`],
  [/^(.+) não pode agir — pulando para o próximo\.$/, (m) => `${m[1]} cannot act — moving to the next one.`],
  [/^Tempo de (.+) esgotado \(10 min\) — avançando\.$/, (m) => `${m[1]} ran out of time (10 min) — moving on.`],
  [/^(.+) fica (.+) por (\d+) turnos\.$/, (m) => `${m[1]} is ${n(m[2])} for ${m[3]} turns.`],
  [/^(.+) está (.+) \((\d+) turnos\)\.$/, (m) => `${m[1]} is ${n(m[2])} (${m[3]} turns).`],
  [/^(.+) se fere em (.+): (\d+) de dano\.$/, (m) => `${m[1]} is hurt by ${m[2]}: ${m[3]} damage.`],
  [/^(.+) recupera (\d+) PV(?: \((.+)\))?\.?$/, (m) => `${m[1]} recovers ${m[2]} HP${m[3] ? ` (${n(m[3])})` : ""}.`],
  [/^(.+) sofre (\d+) de dano(?: \((.+)\))?\.?$/, (m) => `${m[1]} takes ${m[2]} damage${m[3] ? ` (${n(m[3])})` : ""}.`],
  [/^(.+) cai\.$/, (m) => `${m[1]} goes down.`],
  [/^(.+) agora está (.+)\.$/, (m) => `${m[1]} is now ${m[2]}.`],
  [/^(.+) está (.+)\.$/, (m) => `${m[1]} is ${n(m[2])}.`],
  [/^Reputação com (.+): (.+) \(agora (.+)\)\.$/, (m) => `Reputation with ${m[1]}: ${m[2]} (now ${m[3]}).`],
  [/^A expedição acabou no andar (\d+)\. O ouro acumulado \((\d+)\) se perdeu\.$/, (m) => `The expedition ended on floor ${m[1]}. The gold gathered (${m[2]}) was lost.`],
  [/^Andar (\d+): (.+)\.$/, (m) => `Floor ${m[1]}: ${SALAS[m[2]] || m[2]}.`],
  [/^Cada um encontra (\d+) peças de ouro\.$/, (m) => `Everyone finds ${m[1]} gold pieces.`],
  [/^Jogo carregado: (.+)\.$/, (m) => `Game loaded: ${m[1]}.`],
  [/^O grupo decidiu: (.+)\.$/, (m) => `The party decided: ${m[1] === "parar" ? "stop" : "press on"}.`],
  [/^O grupo volta com (\d+) peças de ouro \((\d+) para cada um\) depois de (\d+) (andares|salas)\.$/, (m) => `The party returns with ${m[1]} gold pieces (${m[2]} each) after ${m[3]} ${m[4] === "andares" ? "floors" : "rooms"}.`],
  [/^(?:Votação: )?Andar (\d+) vencido\. Ouro acumulado: (\d+)\. Subir mais um andar ou parar e levar o ouro\?$/, (m) => `Floor ${m[1]} cleared. Gold so far: ${m[2]}. Climb one more floor or stop and keep the gold?`],
  [/^(?:Votação: )?Sala (\d+) vencida\. Ouro acumulado: (\d+)\. Descer mais ou voltar para a superfície\?$/, (m) => `Room ${m[1]} cleared. Gold so far: ${m[2]}. Go deeper or head back to the surface?`],
  [/^Votação: (.+)$/, (m) => `Vote: ${m[1]}`],
  // Erros com números
  [/^(.+) está caído\.$/, (m) => `${m[1]} is down.`],
  [/^A poção custa (\d+) de ouro\.$/, (m) => `The potion costs ${m[1]} gold.`],
  [/^A soma dos atributos pode ser no máximo (\d+) \(está (\d+)\)\.$/, (m) => `Attributes can add up to at most ${m[1]} (currently ${m[2]}).`],
  [/^Dá para carregar no máximo (\d+) poções\.$/, (m) => `You can carry at most ${m[1]} potions.`],
  [/^Limite de (\d+) pontos de salvamento\. Apague um antes\.$/, (m) => `Limit of ${m[1]} save points. Delete one first.`],
  [/^Não consegui confirmar a compra: (.+)$/, (m) => `Could not confirm the purchase: ${m[1]}`],
  [/^O Mestre está narrando a ação de (.+)\.$/, (m) => `The Game Master is narrating ${m[1]}'s action.`],
  [/^O ferreiro cobra (\d+) de ouro por esse trabalho\.$/, (m) => `The blacksmith charges ${m[1]} gold for this job.`],
  [/^Redistribuir de novo custa (\d+) peças de ouro\.$/, (m) => `Redistributing again costs ${m[1]} gold pieces.`],
  [/^Revirar o saque custa (\d+) de ouro\.$/, (m) => `Rerolling the loot costs ${m[1]} gold.`],
  [/^Uma noite na taverna custa (\d+) de ouro\.$/, (m) => `A night at the tavern costs ${m[1]} gold.`],
  [/^Valor inválido para (.+)\.$/, (m) => `Invalid value for ${n(m[1])}.`],
  [/^Seu teste grátis tem menos de (\d+) hora de mesa\. Se acabar no meio de uma luta, ela termina por nossa conta\.$/, (m) => `Your free trial has less than ${m[1]} hour of play left. If it runs out mid-fight, we cover the rest of the fight.`],
  [/^Seu teste grátis termina em (\d+) dias?\.(.*)$/, (m) => `Your free trial ends in ${m[1]} day${m[1] === "1" ? "" : "s"}.`],
];

// Pedaços das linhas de rolagem (ataques e testes), aplicados quando nenhuma frase inteira casa.
const PEDACOS = [
  [/Salvaguarda de (\S+)/g, (_, a) => `${n(a)} saving throw`],
  [/ ataca /g, " attacks "],
  [/→ CRÍTICO, acertou, (\d+) de dano/g, "→ CRITICAL, hit, $1 damage"],
  [/→ acertou, (\d+) de dano/g, "→ hit, $1 damage"],
  [/→ bloqueado\./g, "→ blocked."],
  [/→ errou\./g, "→ missed."],
  [/ \(resistiu\)/g, " (resisted)"],
  [/— CRÍTICO! /g, "— CRITICAL! "],
  [/(\d+) de dano de (\S+?)([ .(])/g, (_, v, el, fim) => `${v} ${n(el)} damage${fim}`],
  [/(\d+) de dano/g, "$1 damage"],
  [/\(o alvo é fraco contra isso\)/g, "(the target is weak to this)"],
  [/\(o alvo resiste\)/g, "(the target resists)"],
  [/\(o alvo é imune\)/g, "(the target is immune)"],
  [/— sucesso/g, "— success"],
  [/— falha/g, "— failure"],
  [/— errou/g, "— missed"],
  [/\(crítico\)/g, "(critical)"],
  [/\(falha crítica\)/g, "(critical failure)"],
  [/\(por pouco\)/g, "(so close)"],
  [/\(errou por pouco\)/g, "(near miss)"],
  [/\(dado real\)/g, "(real die)"],
  [/ vs CA /g, " vs AC "],
  [/ vs CD /g, " vs DC "],
  [/ vs alvo/g, " vs target"],
  [/ cai\.$/g, " goes down."],
  [/ fica (\S+(?: \S+)?) por (\d+) turnos\./g, (_, s, t) => ` is ${n(s)} for ${t} turns.`],
];

/** Traduz uma mensagem de sistema ou de erro. Devolve o original se não souber. */
function traduzir(texto, idioma) {
  if (idioma !== "en" || typeof texto !== "string" || !texto) return texto;
  if (EXATOS[texto]) return EXATOS[texto];
  if (NOMES[texto]) return NOMES[texto];
  for (const [re, fn] of PADROES) {
    const m = re.exec(texto);
    if (m) return fn(m);
  }
  let t = texto;
  for (const [re, por] of PEDACOS) t = t.replace(re, por);
  // Nome de perícia no rótulo de um teste: "Aria · Percepção: 12+3 = 15 vs DC 13".
  t = t.replace(/ · ([^:·]+):/, (tudo, rotulo) => NOMES[rotulo] ? ` · ${NOMES[rotulo]}:` : tudo);
  return t;
}

const CATALOGO_EN = {
  status: {
    envenenado: ["Poisoned", "Takes 1d4 damage at the start of the turn."],
    em_chamas: ["Burning", "Takes 1d6 damage at the start of the turn."],
    sangrando: ["Bleeding", "Takes 1d3 damage at the start of the turn."],
    atordoado: ["Stunned", "Loses the next turn."],
    protegido: ["Shielded", "+2 to AC."],
    regenerando: ["Regenerating", "Recovers 1d4 HP at the start of the turn."],
    abencoado: ["Blessed", "+1 to attacks."],
  },
  talentos: {
    aprendizado_rapido: ["Quick Learner", "+25% XP."],
    cacador_de_gigantes: ["Giant Slayer", "+2 damage against bosses."],
    sede_de_sangue: ["Bloodthirst", "Recover 1 HP on every attack that hits."],
    ultimo_suspiro: ["Last Breath", "Once per fight, stay at 1 HP instead of going down."],
    pele_de_espinhos: ["Thorn Skin", "Whoever hits you takes 1d4 damage."],
    olhar_atento: ["Keen Eye", "Critical hit on a 19 or 20."],
    pes_ligeiros: ["Fleet Feet", "+2 to initiative."],
    couraca: ["Thick Hide", "+1 to AC."],
    negociador: ["Haggler", "+20% gold from loot."],
  },
  subclasses: {
    campeao: ["Champion", "Critical hit on a 19 or 20."],
    guardiao: ["Guardian", "+1 to AC."],
    assassino: ["Assassin", "+2 damage on attacks."],
    trapaceiro: ["Trickster", "+2 to Sleight of Hand and Stealth."],
    evocador: ["Evoker", "+2 damage with elemental attacks."],
    abjurador: ["Abjurer", "+1 to AC and +1 to Arcana."],
    vida: ["Life Domain", "+2 to all healing the party receives from you."],
    guerra: ["War Domain", "+1 to attacks."],
  },
  loja: {
    taverna: ["Night at the tavern", "Restores all HP and clears statuses. Outside combat."],
    pocao: ["Healing potion", "Carry up to 3. Heals 2d4 + 2 + level; in combat it uses your turn."],
    ferreiro: ["Blacksmith", "Improves the rarity of one of your items (up to Epic)."],
    refazerSaque: ["Reroll the loot", "Swaps your 3 current loot options for new ones."],
  },
};

/** Catálogo de regras no idioma pedido. */
function catalogo(cat, idioma) {
  if (idioma !== "en") return cat;
  const tr = (tabela, mapa) => Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, tabela[k] ? { ...v, nome: tabela[k][0], descricao: tabela[k][1] } : v]));
  return {
    ...cat,
    elementos: mapaNomes(cat.elementos, idioma), raridades: mapaNomes(cat.raridades, idioma),
    climas: mapaNomes(cat.climas, idioma), periodos: mapaNomes(cat.periodos, idioma),
    status: tr(CATALOGO_EN.status, cat.status),
    talentos: tr(CATALOGO_EN.talentos, cat.talentos),
    subclasses: Object.fromEntries(Object.entries(cat.subclasses).map(([classe, subs]) => [classe, tr(CATALOGO_EN.subclasses, subs)])),
    loja: cat.loja ? { ...cat.loja, produtos: tr(CATALOGO_EN.loja, cat.loja.produtos) } : cat.loja,
  };
}

/** Ficha no idioma pedido: nomes e descrições dos itens gerados. */
function ficha(f, idioma) {
  if (idioma !== "en" || !f) return f;
  return {
    ...f,
    itens: (f.itens || []).map((it) => ({ ...it, nome: nomeItem(it.nome), descricao: descricaoItem(it.descricao) })),
    ataques: (f.ataques || []).map((a) => ({ ...a, nomeExibido: NOMES[a.nome] || a.nome })),
  };
}

function descricaoItem(d) {
  return String(d || "")
    .replace(/^\+(\d+) nos ataques, dano de (\S+)\.$/, (_, b, el) => `+${b} to attacks, ${n(el)} damage.`)
    .replace(/^\+(\d+) nos ataques\.$/, "+$1 to attacks.")
    .replace(/^\+(\d+) na CA\.$/, "+$1 to AC.")
    .replace(/^Resistência a (\S+)\. \+(\d+) nos testes de perícia\.$/, (_, el, b) => `Resistance to ${n(el)}. +${b} to skill checks.`)
    .replace(/^\+(\d+) nos testes de perícia\.$/, "+$1 to skill checks.");
}

/** Idioma pedido pelo aparelho. */
function idiomaDe(req) {
  const h = String(req?.headers?.["x-idioma"] || "").toLowerCase();
  return h.startsWith("en") ? "en" : "pt";
}

/** Traduz os nomes de um mapa { chave: "Nome" }. */
function mapaNomes(mapa, idioma) {
  if (idioma !== "en") return mapa;
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, NOMES[v] || v]));
}

module.exports = { catalogo, ficha, descricaoItem, traduzir, idiomaDe, nomeItem, mapaNomes, NOMES, EXATOS };
