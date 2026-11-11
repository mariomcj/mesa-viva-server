/**
 * Melhorias que valem só no servidor (o app instalado não precisa mudar):
 * memória da campanha (fatos, NPCs e reputação), encontros de estrada, clima e período do dia,
 * chance de sucesso e selos de resultado, elementos com fraqueza e resistência, condições com duração,
 * inimigos que fogem, XP por marco da história, reaproveitamento de fundos, medição do uso da IA e depuração no admin.
 *
 * Tudo aqui é acréscimo: o server.js chama os ganchos devolvidos por `instalar`. As frases que já existiam no diário
 * não mudam (o app reconhece eventos pelo texto), e nenhum aviso novo usa o tipo "narr" (o app leria em voz alta).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const R = require("./regras");

const inteiro = (v, min, max, padrao = min) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao; };
const curto = (v, max) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : "");
const objeto = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

// ── Memória da campanha ──
const MAX_FATOS = 40, MAX_NPCS = 24, MAX_FACCOES = 8, REPUTACAO_MAX = 10;

/** Estado do mundo guardado na mesa (coluna `mundo`), sempre completo e dentro dos limites. */
function normalizarMundo(bruto) {
  let b = bruto;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  b = objeto(b) || {};
  const pares = (v, maxChave, maxValor, limite) => {
    const saida = {};
    for (const [k, x] of Object.entries(objeto(v) || {})) {
      const chave = curto(k, maxChave), valor = curto(objeto(x) ? x.v : x, maxValor);
      if (chave && valor) saida[chave] = { v: valor, t: Number(objeto(x)?.t) || 0 };
    }
    return Object.fromEntries(Object.entries(saida).sort((a, c) => a[1].t - c[1].t).slice(-limite));
  };
  const reputacao = {};
  for (const [k, n] of Object.entries(objeto(b.reputacao) || {})) {
    const chave = curto(k, 30);
    if (chave && Object.keys(reputacao).length < MAX_FACCOES) reputacao[chave] = inteiro(n, -REPUTACAO_MAX, REPUTACAO_MAX, 0);
  }
  return {
    fatos: pares(b.fatos, 40, 100, MAX_FATOS),
    npcs: pares(b.npcs, 30, 60, MAX_NPCS),
    reputacao,
    clima: CLIMAS.includes(b.clima) ? b.clima : "",
    periodo: PERIODOS.includes(b.periodo) ? b.periodo : "",
    narr: inteiro(b.narr, 0, 9999, 0),                 // narrações desde o último encontro de estrada
    encontro: curto(b.encontro, 200),                  // semente à espera de ser usada pelo Mestre
  };
}

/** Nome de fato sem espaços nem acentos: "Ponte Restaurada" → "ponte_restaurada". */
const chaveDeFato = (k) => curto(k, 60).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/**
 * Aplica o campo "memoria" da resposta do Mestre: { fatos: {chave: "texto"|true|null}, npcs: {nome: "atitude"|null},
 * reputacao: {grupo: +1|-1} }. Valor null ou false apaga. Devolve as linhas de reputação para o diário.
 */
function aplicarMemoria(mundo, memoria, t = Date.now()) {
  const m = objeto(memoria);
  const linhas = [];
  if (!m) return linhas;
  const gravar = (alvo, lista, chaveDe, maxValor, limite) => {
    for (const [k, v] of Object.entries(objeto(lista) || {}).slice(0, 8)) {
      const chave = chaveDe(k);
      if (!chave) continue;
      if (v === null || v === false || v === "") { delete alvo[chave]; continue; }
      const valor = v === true ? "sim" : curto(v, maxValor);
      if (valor) alvo[chave] = { v: valor, t };
    }
    const excesso = Object.keys(alvo).length - limite;
    if (excesso > 0) for (const [k] of Object.entries(alvo).sort((a, c) => a[1].t - c[1].t).slice(0, excesso)) delete alvo[k];
  };
  gravar(mundo.fatos, m.fatos, chaveDeFato, 100, MAX_FATOS);
  gravar(mundo.npcs, m.npcs, (k) => curto(k, 30), 60, MAX_NPCS);
  for (const [k, v] of Object.entries(objeto(m.reputacao) || {}).slice(0, 4)) {
    const grupo = curto(k, 30), delta = inteiro(v, -2, 2, 0);
    if (!grupo || !delta) continue;
    if (!(grupo in mundo.reputacao) && Object.keys(mundo.reputacao).length >= MAX_FACCOES) continue;
    const antes = mundo.reputacao[grupo] || 0;
    const agora = Math.max(-REPUTACAO_MAX, Math.min(REPUTACAO_MAX, antes + delta));
    if (agora === antes) continue;
    mundo.reputacao[grupo] = agora;
    linhas.push(`Reputação com ${grupo}: ${R.sinal(agora - antes)} (agora ${R.sinal(agora)}, ${nomeDaReputacao(agora)}).`);
  }
  return linhas;
}
const nomeDaReputacao = (n) => (n >= 6 ? "aliados" : n >= 2 ? "bem-vistos" : n > -2 ? "neutros" : n > -6 ? "malvistos" : "inimigos");

// ── Encontros de estrada ──
const ENCONTROS = [
  "um viajante ferido pede ajuda, mas esconde de quem está fugindo",
  "a passagem adiante está bloqueada (ponte quebrada, deslizamento, porta emperrada) e há mais de um jeito de seguir",
  "um mercador oferece um bom negócio com pressa demais para ser honesto",
  "duas pessoas discutem por algo que ambas dizem ser seu e pedem que o grupo decida",
  "alguém segue o grupo de longe há algum tempo, sem se aproximar",
  "uma criatura ou máquina presa numa armadilha: soltar tem um risco, deixar tem outro",
  "um mensageiro apressado deixa cair algo valioso e não percebe",
  "um abrigo abandonado com sinais de que alguém saiu às pressas há pouco",
  "um grupo rival vai na mesma direção e propõe dividir o caminho",
  "um guarda ou vigia cobra uma passagem que talvez não tenha direito de cobrar",
  "um pedido de socorro vem de um lugar onde seria fácil armar uma emboscada",
  "um velho conhecido de um dos personagens aparece, mudado, e precisa de um favor",
  "um objeto estranho no caminho, claramente deixado ali de propósito",
  "o caminho se divide: um lado é rápido e perigoso, o outro é seguro e demorado",
  "alguém oferece uma informação útil em troca de uma promessa",
  "um animal ou ajudante perdido se apega ao grupo e alguém vem procurá-lo",
  "uma festa, feira ou cerimônia ocupa o caminho e convida o grupo a participar",
  "um aviso riscado às pressas alerta sobre o que há adiante, e nem tudo nele é verdade",
];
/** Narrações de jogadores entre um encontro e outro (no mínimo). */
const INTERVALO_DE_ENCONTROS = 6;
const sortearEncontro = (rng = Math.random) => ENCONTROS[Math.floor(rng() * ENCONTROS.length) % ENCONTROS.length];

// ── Clima e período do dia ──
const CLIMAS = ["limpo", "chuva", "neblina", "tempestade", "neve", "calor"];
const PERIODOS = ["manha", "tarde", "noite", "madrugada"];
const NOME_PERIODO = { manha: "manhã", tarde: "tarde", noite: "noite", madrugada: "madrugada" };
const EFEITO_PERIODO = { noite: { Furtividade: 2, Percepção: -2 }, madrugada: { Furtividade: 2, Percepção: -2 } };
const EFEITO_CLIMA = {
  neblina: { Furtividade: 2, Percepção: -2 },
  chuva: { Atletismo: -2, Acrobacia: -2 },
  tempestade: { Atletismo: -2, Acrobacia: -2, Percepção: -2 },
  neve: { Acrobacia: -2, Sobrevivência: -2 },
  calor: { Sobrevivência: -2 },
};
/** Ajuste do clima e do período num teste de perícia: { valor (de -2 a +2), motivo } ou null. */
function ajusteDoAmbiente(mundo, pericia) {
  const p = EFEITO_PERIODO[mundo?.periodo]?.[pericia] || 0, c = EFEITO_CLIMA[mundo?.clima]?.[pericia] || 0;
  const valor = Math.max(-2, Math.min(2, p + c));
  if (!valor) return null;
  const motivo = [c ? mundo.clima : "", p ? NOME_PERIODO[mundo.periodo] : ""].filter(Boolean).join(" e ");
  return { valor, motivo };
}
const descreverAmbiente = (mundo) => [mundo.clima, NOME_PERIODO[mundo.periodo]].filter(Boolean).join(", ");

// ── Chance de sucesso ──
/** Chance de passar num d20 + bônus contra a dificuldade, em % (1 natural sempre falha, 20 natural sempre passa). */
function chanceDeSucesso(bonus, cd) {
  const precisa = Math.max(2, Math.min(20, (Number(cd) || 13) - (Number(bonus) || 0)));
  return Math.max(5, Math.min(95, (21 - precisa) * 5));
}

// ── Elementos ──
const PALAVRAS_DE_ELEMENTO = {
  fogo: ["fogo", "chama", "flamej", "ardente", "igne", "brasa", "incendi", "lava"],
  gelo: ["gelo", "geada", "frio", "congel", "glacial", "neve"],
  raio: ["raio", "relampago", "trovao", "chocante", "choque", "eletr"],
  veneno: ["veneno", "acido", "toxic", "peconh"],
  luz: ["luz", "sagrad", "divin", "radiante", "solar", "espiritual", "guardiao da fe"],
  sombra: ["sombra", "trevas", "necro", "profan", "infligir ferimentos"],
};
/** Elemento de um ataque ou magia pelo nome ("Bola de Fogo" → fogo); "" se não tem. */
function elementoDoNome(nome) {
  const k = R.chave(nome);
  if (!k) return "";
  if (k === "raio de gelo" || k === "cone de frio" || k === "tempestade de gelo") return "gelo";
  for (const [el, palavras] of Object.entries(PALAVRAS_DE_ELEMENTO)) if (palavras.some((p) => k.includes(p))) return el;
  return "";
}
/** Condição que um acerto crítico com esse elemento deixa no alvo. */
const STATUS_DO_CRITICO = { fogo: ["em_chamas", 2], veneno: ["envenenado", 3], raio: ["atordoado", 1] };

/**
 * Dano de um ataque com elemento contra um inimigo. Devolve { dano, selo, nota } (selo e nota vazios se nada muda).
 * Fraqueza ×1,5; resistência ×0,5; imunidade 0. Na chuva ou tempestade, o fogo perde metade da força (menos contra quem é fraco a ele).
 */
function danoComElemento(dano, elemento, alvo, mundo) {
  const tem = (campo) => Array.isArray(alvo?.[campo]) && alvo[campo].includes(elemento);
  if (!elemento || dano <= 0) return { dano, selo: "", nota: "" };
  if (tem("imunidades")) return { dano: 0, selo: "imune", nota: `${alvo.nome} é imune a ${elemento}` };
  const fraco = tem("fraquezas");
  if (fraco) return { dano: Math.ceil(dano * 1.5), selo: "fraqueza", nota: `${alvo.nome} é fraco a ${elemento}: dano ×1,5` };
  if (tem("resistencias")) return { dano: Math.max(1, Math.floor(dano / 2)), selo: "resistiu", nota: `${alvo.nome} resiste a ${elemento}: metade do dano` };
  if (elemento === "fogo" && (mundo?.clima === "chuva" || mundo?.clima === "tempestade")) {
    return { dano: Math.max(1, Math.floor(dano / 2)), selo: "resistiu", nota: "a chuva enfraquece o fogo: metade do dano" };
  }
  return { dano, selo: "", nota: "" };
}

// ── Condições com duração em turnos ──
const NOME_STATUS = { envenenado: "envenenado", em_chamas: "em chamas", atordoado: "atordoado", protegido: "protegido", regenerando: "regenerando" };
const DANO_POR_TURNO = { envenenado: 2, em_chamas: 3 };
const CURA_POR_TURNO = { regenerando: 2 };
const BONUS_PROTEGIDO = 2;
const turnos = (n) => `${n} ${n === 1 ? "turno" : "turnos"}`;

/** Põe (ou renova) uma condição em uma ficha ou inimigo. Devolve a linha do diário, ou "" se nada mudou. */
function aplicarStatus(alvo, tipo, duracao) {
  if (!alvo || !R.STATUS.includes(tipo) || !(alvo.pv > 0)) return "";
  const n = inteiro(duracao, 1, R.MAX_TURNOS_STATUS, 2);
  const lista = R.statusValidos(alvo.status);
  const atual = lista.find((s) => s.tipo === tipo);
  if (atual) { if (atual.turnos >= n) return ""; atual.turnos = n; }
  else lista.push({ tipo, turnos: n });
  alvo.status = lista;
  return `${alvo.nome} fica ${NOME_STATUS[tipo]} por ${turnos(n)}.`;
}

/**
 * Começo do turno de quem tem condições: aplica dano ou cura, desconta um turno de cada uma e diz se perde a vez.
 * Devolve { linhas, pula, mudou }. Altera `alvo` (pv e status).
 */
function processarStatus(alvo) {
  const lista = R.statusValidos(alvo?.status);
  if (!lista.length || !(alvo.pv > 0)) return { linhas: [], pula: false, mudou: false };
  const linhas = [];
  let pula = false;
  for (const s of lista) {
    if (DANO_POR_TURNO[s.tipo] && alvo.pv > 0) {
      const v = DANO_POR_TURNO[s.tipo];
      alvo.pv = Math.max(0, alvo.pv - v);
      linhas.push(`${alvo.nome} sofre ${v} de dano por estar ${NOME_STATUS[s.tipo]}${alvo.pv <= 0 ? " e cai" : ""}.`);
    }
    if (CURA_POR_TURNO[s.tipo] && alvo.pv > 0 && alvo.pv < alvo.pvMax) {
      const v = Math.min(CURA_POR_TURNO[s.tipo], alvo.pvMax - alvo.pv);
      alvo.pv += v;
      linhas.push(`${alvo.nome} recupera ${v} PV por estar regenerando.`);
    }
    if (s.tipo === "atordoado" && alvo.pv > 0) { pula = true; linhas.push(`${alvo.nome} está atordoado e perde a vez.`); }
    s.turnos -= 1;
    if (s.turnos <= 0 && alvo.pv > 0) linhas.push(`${alvo.nome} não está mais ${NOME_STATUS[s.tipo]}.`);
  }
  alvo.status = alvo.pv > 0 ? lista.filter((s) => s.turnos > 0) : [];
  return { linhas, pula, mudou: true };
}
const temStatus = (alvo, tipo) => R.statusValidos(alvo?.status).some((s) => s.tipo === tipo);
const descreverStatus = (alvo) => R.statusValidos(alvo?.status).map((s) => `${NOME_STATUS[s.tipo]} (${turnos(s.turnos)})`).join(", ");

// ── Inimigos que fogem ──
/**
 * Um inimigo muito ferido e em desvantagem foge em vez de atacar: com 1/4 da vida ou menos e menos inimigos de pé
 * do que personagens. Chefes (40 PV ou mais) e criaturas pequenas (menos de 6 PV) lutam até o fim.
 * Desligar: FUGA_DE_INIMIGOS=0.
 */
function inimigoFoge(inimigo, c, personagensDePe, rng = Math.random) {
  if (process.env.FUGA_DE_INIMIGOS === "0") return false;
  if (!inimigo || inimigo.pv <= 0 || inimigo.pvMax < 6 || inimigo.pvMax >= 40) return false;
  if (inimigo.pv > inimigo.pvMax / 4) return false;
  const dePe = (c?.inimigos || []).filter((i) => i.pv > 0).length;
  return dePe < personagensDePe && rng() < 0.5;
}

// ── Selos de resultado (o texto curto que o app mostra ao lado de cada rolagem) ──
/**
 * Selo de uma rolagem resolvida. Devolve "" quando vale o selo de sempre ("acertou, N de dano", "sucesso", "falha").
 * Mantém "N de dano" no texto: o app lê o dano dali.
 */
function seloDaRolagem(rol, r, selElemento = "") {
  const margem = r.total - (rol.cd || 13);
  if (rol.tipo === "ataque") {
    if (r.dano !== undefined) {
      if (selElemento === "imune") return "imune: 0 de dano";
      const critico = r.natural === 20 ? "crítico! " : "";
      if (selElemento === "fraqueza") return `${critico}fraqueza: ${r.dano} de dano`;
      if (selElemento === "resistiu") return `${critico}resistiu: ${r.dano} de dano`;
      return critico ? `crítico! ${r.dano} de dano` : "";
    }
    if (r.natural === 1) return "falha crítica";
    return margem >= -2 ? "errou por pouco" : "";
  }
  if (r.natural === 20) return "sucesso crítico";
  if (r.natural === 1) return "falha crítica";
  if (!r.sucesso && margem >= -2) return "falha por pouco";
  return "";
}

// ── Reaproveitamento de fundos ──
const TIPOS_DE_LUGAR = {
  taverna: ["taverna", "estalagem", "bar", "cantina", "saloon", "pub", "boteco"], floresta: ["floresta", "mata", "bosque", "selva"],
  caverna: ["caverna", "gruta", "tunel", "mina", "galeria"], masmorra: ["masmorra", "calabouco", "cripta", "catacumba", "porao"],
  cidade: ["cidade", "rua", "beco", "praca", "mercado", "vila", "aldeia", "bairro"], castelo: ["castelo", "fortaleza", "palacio", "torre", "muralha", "salao"],
  estrada: ["estrada", "trilha", "caminho", "ponte", "encruzilhada"], templo: ["templo", "igreja", "santuario", "capela", "mosteiro"],
  porto: ["porto", "cais", "doca", "praia", "costa"], navio: ["navio", "barco", "conves", "galeao"],
  deserto: ["deserto", "duna", "oasis"], montanha: ["montanha", "penhasco", "desfiladeiro", "pico", "serra"],
  pantano: ["pantano", "brejo", "charco"], cemiterio: ["cemiterio", "tumulo", "mausoleu"],
  acampamento: ["acampamento", "fogueira", "clareira"], laboratorio: ["laboratorio", "oficina", "forja"],
  nave: ["nave", "estacao", "hangar", "ponte de comando"], escola: ["escola", "academia", "biblioteca", "sala de aula"],
  casa: ["casa", "mansao", "quarto", "cabana", "apartamento"], rio: ["rio", "lago", "riacho", "cachoeira"],
};
const slug = (s) => R.chave(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
/** Tipo de lugar de uma cena pelo nome ("Taverna Javali Cego" → taverna); "" se não reconhece. */
function tipoDeLugar(cena) {
  const s = slug(cena), palavras = s.split("-");
  const tipos = Object.entries(TIPOS_DE_LUGAR);
  // expressões de mais de uma palavra valem primeiro ("ponte de comando" é nave, não estrada)
  for (const [tipo, lista] of tipos) if (lista.some((p) => p.includes(" ") && s.includes(slug(p)))) return tipo;
  for (const [tipo, lista] of tipos) if (lista.some((p) => !p.includes(" ") && palavras.includes(p))) return tipo;
  return "";
}
const EXTENSOES_DE_IMAGEM = [".webp", ".jpg", ".jpeg", ".png"];
/** Fundos do mesmo tipo de lugar guardados antes de começar a repetir (no mesmo tema). */
const VARIANTES_POR_TIPO = 2;

/**
 * Liga as melhorias ao servidor. `d` traz o que o server.js já tem. Devolve os ganchos usados por ele.
 */
function instalar(d) {
  const { app, db, adminMw, salvarMesa, salvarFicha, registrar, broadcast, erro, json, texto, M, T, ganharXp, baseUrl, pastaPublica } = d;

  try { db.exec("ALTER TABLE mesas ADD COLUMN mundo TEXT DEFAULT NULL"); } catch (e) {}
  db.exec("CREATE TABLE IF NOT EXISTS fundos (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT NOT NULL, url TEXT NOT NULL, criadoEm INTEGER NOT NULL)");
  db.exec("CREATE INDEX IF NOT EXISTS fundos_chave ON fundos (chave)");
  // "uso_ia_diario", e não "uso_ia": bancos que passaram por uma versão antiga já têm uma tabela "uso_ia" com outras colunas, que fica como está
  db.exec("CREATE TABLE IF NOT EXISTS uso_ia_diario (dia TEXT NOT NULL, tipo TEXT NOT NULL, modelo TEXT NOT NULL, chamadas INTEGER NOT NULL DEFAULT 0, entrada INTEGER NOT NULL DEFAULT 0, saida INTEGER NOT NULL DEFAULT 0, custo REAL NOT NULL DEFAULT 0, PRIMARY KEY (dia, tipo, modelo))");

  /** Nenhuma melhoria pode derrubar uma ação do jogo: se um gancho falhar, o erro vai para o log e vale o comportamento de antes. */
  const seguro = (nome, f, padrao) => (...a) => {
    try { return f(...a); } catch (e) { console.error(`[melhorias] ${nome}: ${e.message}`); return typeof padrao === "function" ? padrao(...a) : padrao; }
  };

  const mundoDaMesa = (codigo) => normalizarMundo(db.prepare("SELECT mundo FROM mesas WHERE codigo = ?").get(codigo)?.mundo);
  const xpDoAto = () => inteiro(process.env.XP_POR_ATO, 0, 500, 40);
  const xpDoFim = () => inteiro(process.env.XP_POR_FIM, 0, 500, 60);

  // ── Contexto do Mestre ──
  /** Bloco acrescentado ao fim do contexto: memória, ambiente, condições, fraquezas, encontro e os campos extras do JSON. */
  function bloco(mesa, fichas) {
    const mundo = normalizarMundo(mesa?.mundo);
    const c = json(mesa?.combate);
    const lista = (o, f) => Object.entries(o).map(f).join("; ");
    const partes = [];
    const memoria = [];
    if (Object.keys(mundo.fatos).length) memoria.push(`- Fatos: ${lista(mundo.fatos, ([k, x]) => `${k} = ${x.v}`)}`);
    if (Object.keys(mundo.npcs).length) memoria.push(`- NPCs e o que sentem pelo grupo: ${lista(mundo.npcs, ([k, x]) => `${k} = ${x.v}`)}`);
    if (Object.keys(mundo.reputacao).length) memoria.push(`- Reputação com grupos (de -10 a +10): ${lista(mundo.reputacao, ([k, n]) => `${k} ${R.sinal(n)} (${nomeDaReputacao(n)})`)}`);
    if (memoria.length) partes.push(`MEMÓRIA DA CAMPANHA (já aconteceu e continua valendo: nunca contradiga, e faça o mundo reagir a isto):\n${memoria.join("\n")}`);
    if (mundo.clima || mundo.periodo) partes.push(`CLIMA E PERÍODO DO DIA: ${descreverAmbiente(mundo)}. Narre de acordo. O jogo já ajusta os testes (à noite e na neblina é mais fácil se esconder e mais difícil perceber; na chuva o chão escorrega e o fogo perde força).`);
    const condicoes = [...(fichas || []), ...(c?.inimigos || []).filter((i) => i.pv > 0)].filter((x) => R.statusValidos(x.status).length).map((x) => `${x.nome}: ${descreverStatus(x)}`);
    if (condicoes.length) partes.push(`CONDIÇÕES ATIVAS (o jogo aplica os efeitos a cada turno; só narre): ${condicoes.join("; ")}`);
    const elementos = (c?.inimigos || []).filter((i) => i.pv > 0).map((i) => {
      const t = [i.fraquezas?.length ? `fraco a ${i.fraquezas.join(" e ")}` : "", i.resistencias?.length ? `resiste a ${i.resistencias.join(" e ")}` : "", i.imunidades?.length ? `imune a ${i.imunidades.join(" e ")}` : ""].filter(Boolean);
      return t.length ? `${i.nome}: ${t.join(", ")}` : "";
    }).filter(Boolean);
    if (elementos.length) partes.push(`ELEMENTOS DOS INIMIGOS (o jogo aplica no dano; dê pistas na narração, sem dizer os números): ${elementos.join("; ")}`);
    if (mundo.encontro && !c) partes.push(`ENCONTRO DE ESTRADA (use agora, se o grupo estiver a caminho de algum lugar ou entre uma cena e outra; adapte ao tema e à história): ${mundo.encontro}. Faça um encontro curto, com 2 ou 3 saídas possíveis e, se couber, um teste. Se não couber agora, ignore.`);
    partes.push(`CAMPOS EXTRAS DO JSON (opcionais; mande só quando mudarem, senão omita):
- "memoria": {"fatos":{"nome_curto_sem_espacos":"o que aconteceu, em poucas palavras"},"npcs":{"Nome do NPC":"o que sente pelo grupo agora"},"reputacao":{"Nome do grupo ou facção":1}} — anote escolhas e consequências que devem ser lembradas mais tarde (alguém foi salvo, traído, poupado; algo foi destruído, prometido, descoberto). Em "reputacao" mande só a mudança, de -2 a +2. Para apagar um fato ou NPC, mande null no valor.
- "clima": "${CLIMAS.join("|")}" e "periodo": "${PERIODOS.join("|")}" — quando o tempo ou a hora do dia mudarem na história.
- Em cada inimigo de "combate": "fraquezas", "resistencias" e "imunidades", listas com elementos entre ${R.ELEMENTOS.join(", ")} (só quando fizer sentido para a criatura).
- Em "efeitos": {"alvo":"id","status":"${R.STATUS.join("|")}","turnos":2} — uma condição que vem da história (veneno de armadilha, bênção de um NPC), de 1 a ${R.MAX_TURNOS_STATUS} turnos. Vale para personagens e, em combate, para inimigos. Os turnos só contam em combate; fora dele a condição fica para a próxima luta e some quando o dia vira.`);
    return `\n\n${partes.join("\n\n")}`;
  }
  M.definirExtraDoContexto(bloco);

  // ── Resposta do Mestre ──
  /**
   * Chamado em `aplicar`, depois dos efeitos de dano e cura: memória, clima, condições, XP por marco e encontros.
   * `e`: { combate, campos, permitirTeste }. Pode alterar `e.campos.combate` (condição num inimigo).
   */
  function aoNarrar(ctx, r, e) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return;
    const codigo = ctx.codigo;
    const mundo = mundoDaMesa(codigo);
    const antes = JSON.stringify(mundo);

    for (const linha of aplicarMemoria(mundo, r.memoria)) registrar(codigo, { tipo: "sys", texto: linha });
    if (CLIMAS.includes(r.clima)) mundo.clima = r.clima;
    if (PERIODOS.includes(r.periodo)) mundo.periodo = r.periodo;
    if ((r.novo_dia === true || r.novo_dia === "true") && !e.combate) {
      if (!PERIODOS.includes(r.periodo)) mundo.periodo = "manha";
      // um dia novo limpa as condições que sobraram
      for (const f of Object.values(ctx.fichas)) if (R.statusValidos(f.status).length) { delete f.status; salvarFicha(codigo, f); }
    }

    // condições mandadas pelo Mestre em "efeitos"
    for (const ef of Array.isArray(r.efeitos) ? r.efeitos.slice(0, 6) : []) {
      if (!ef || !R.STATUS.includes(ef.status)) continue;
      const f = Object.values(ctx.fichas).find((x) => x.uid === ef.alvo || R.chave(x.nome) === R.chave(ef.alvo));
      const ini = f ? null : e.combate?.inimigos?.find((i) => i.id === ef.alvo || R.chave(i.nome) === R.chave(ef.alvo));
      const linha = aplicarStatus(f || ini, ef.status, ef.turnos);
      if (!linha) continue;
      if (f) salvarFicha(codigo, f); else e.campos.combate = e.combate;
      registrar(codigo, { tipo: "sys", texto: linha });
    }

    // XP por marco: o ato virou ou a história terminou nesta resposta
    const m = db.prepare("SELECT fase, ato, arcoConcluido FROM mesas WHERE codigo = ?").get(codigo);
    const ato = M.numAto(m?.ato), fim = !!Number(m?.arcoConcluido);
    const marco = ato > M.numAto(ctx.mesa.ato) ? xpDoAto() : fim && !Number(ctx.mesa.arcoConcluido) ? xpDoFim() : 0;
    ctx.mesa.ato = ato;
    ctx.mesa.arcoConcluido = fim ? 1 : 0;
    if (marco > 0) {
      registrar(codigo, { tipo: "sys", texto: `Marco da história: +${marco} XP para cada personagem.`, ok: true });
      for (const f of Object.values(ctx.fichas)) ganharXp(ctx, f, marco);
    }

    // encontros de estrada: só conta narração de ação de jogador, fora de combate
    if (e.permitirTeste && r.narracao && m?.fase === "jogo") {
      if (mundo.encontro) { mundo.encontro = ""; mundo.narr = 0; }      // a semente foi mostrada ao Mestre nesta resposta
      else mundo.narr += 1;
      const cenaMudou = !!r.cena && texto(r.cena, 60) !== ctx.mesa.cena;
      const semCombate = !e.combate && !(Array.isArray(r.combate?.inimigos) && r.combate.inimigos.length);
      if (process.env.ENCONTROS_DE_ESTRADA !== "0" && cenaMudou && semCombate && !fim && mundo.narr >= INTERVALO_DE_ENCONTROS) mundo.encontro = sortearEncontro();
    }
    if (JSON.stringify(mundo) !== antes) { salvarMesa(codigo, { mundo }); ctx.mesa.mundo = mundo; }
  }

  // ── Rolagens ──
  /** Rolagem recém-montada: ajuste do clima (perícias), elemento (ataques) e a chance de sucesso no rótulo. */
  function aoMontarRolagem(ctx, rol) {
    if (!rol || typeof rol !== "object") return rol;
    const mundo = normalizarMundo(ctx.mesa?.mundo);
    if (rol.tipo === "ataque") {
      const el = elementoDoNome(rol.motivo) || elementoDoNome(String(rol.rotulo || "").split(" vs ")[0]);
      if (el) rol.elemento = el;
    } else {
      const aj = ajusteDoAmbiente(mundo, rol.rotulo);
      if (aj) { rol.bonus = (rol.bonus || 0) + aj.valor; rol.rotulo += ` (${aj.motivo} ${R.sinal(aj.valor)})`; }
    }
    // a chance aparece quando a mesa mostra a dificuldade e CHANCE_VISIVEL=1 (muda o texto do rótulo, por isso é ligada no .env)
    if (ctx.mesa?.cdVisivel !== 0 && ctx.mesa?.cdVisivel !== false && process.env.CHANCE_VISIVEL === "1") rol.rotulo += ` (chance ${chanceDeSucesso(rol.bonus, rol.cd)}%)`;
    return rol;
  }
  /** Opções para regras.resolverRolagem: dano com elemento, selo do resultado e condição deixada por um crítico. */
  function opcoesDeRolagem(ctx) {
    const mundo = normalizarMundo(ctx.mesa?.mundo);
    return {
      ajustarDano: seguro("ajustarDano", (rol, alvo, dano, critico) => {
        const r = danoComElemento(dano, rol.elemento || "", alvo, mundo);
        const avisos = [];
        const st = critico && r.dano > 0 && alvo && alvo.pv - r.dano > 0 ? STATUS_DO_CRITICO[rol.elemento] : null;
        if (r.nota) avisos.push(`${r.nota[0].toUpperCase()}${r.nota.slice(1)}.`);
        return { ...r, avisos, depois: st ? seguro("statusDoCritico", () => { const l = aplicarStatus(alvo, st[0], st[1]); if (l) avisos.push(l); }) : null };
      }, null),
      selo: seguro("selo", seloDaRolagem, ""),
    };
  }

  // ── Turnos do combate ──
  /** Opções para regras.passarVez: condições no começo do turno, fuga e CA de quem está protegido. `mudadas`: fichas a gravar. */
  function opcoesDeTurno(ctx) {
    const mudadas = new Set();
    return {
      mudadas,
      inicioDoTurno: seguro("inicioDoTurno", (alvo, tipo) => {
        const r = processarStatus(alvo);
        if (r.mudou && tipo === "pj") mudadas.add(alvo);
        return r;
      }, { linhas: [], pula: false }),
      foge: seguro("foge", (inimigo, c, alvos) => inimigoFoge(inimigo, c, alvos.length), false),
      bonusCA: seguro("bonusCA", (alvo) => (temStatus(alvo, "protegido") ? BONUS_PROTEGIDO : 0), 0),
    };
  }
  /** Fim do combate: as condições não saem da luta. */
  function aoFimDoCombate(ctx) {
    for (const f of Object.values(ctx.fichas)) if (R.statusValidos(f.status).length) { delete f.status; salvarFicha(ctx.codigo, f); }
  }

  // ── Fundos ──
  const relativa = (url) => { const i = String(url || "").indexOf("/images/"); return i >= 0 && !String(url).startsWith("data:") ? String(url).slice(i) : ""; };
  const existe = (rel) => { try { return fs.existsSync(path.join(pastaPublica, rel)); } catch { return false; } };
  const absoluta = (rel) => { const base = typeof baseUrl === "function" ? baseUrl() : baseUrl; return base ? `${base}${rel}` : rel; };
  const contarUso = (tipo, modelo) => medir({ tipo, modelo, uso: null });
  /** Arquivo pronto da biblioteca (public/fundos/<tema>/ ou public/fundos/geral/), pelo nome da cena ou pelo tipo de lugar. */
  function daBiblioteca(tema, cena) {
    const nomes = [slug(cena), tipoDeLugar(cena)].filter(Boolean);
    for (const pasta of [tema.id, "geral"]) for (const nome of nomes) for (const ext of EXTENSOES_DE_IMAGEM) {
      const rel = `/fundos/${pasta}/${nome}${ext}`;
      if (existe(rel)) return rel;
    }
    return "";
  }
  /**
   * Fundo que já existe para a cena, sem gerar imagem: da biblioteca; senão um já gerado para a mesma cena do mesmo tema;
   * senão, quando já há variantes suficientes, um do mesmo tipo de lugar. "" se é preciso gerar.
   * REAPROVEITAR_FUNDOS=0 desliga o reaproveitamento dos gerados; =exato só reaproveita a mesma cena.
   */
  function fundoPronto(tema, cena, rng = Math.random) {
    if (!cena || !tema) return "";
    const pronto = daBiblioteca(tema, cena);
    if (pronto) { contarUso("fundo-biblioteca", "-"); return absoluta(pronto); }
    const modo = process.env.REAPROVEITAR_FUNDOS;
    if (modo === "0") return "";
    const validos = (chave) => db.prepare("SELECT id, url FROM fundos WHERE chave = ? ORDER BY id DESC LIMIT 12").all(chave)
      .filter((f) => existe(f.url) || (db.prepare("DELETE FROM fundos WHERE id = ?").run(f.id), false));
    const mesma = validos(`${tema.id}|${slug(cena)}`);
    if (mesma.length) { contarUso("fundo-reaproveitado", "-"); return absoluta(mesma[0].url); }
    const tipo = modo === "exato" ? "" : tipoDeLugar(cena);
    if (!tipo) return "";
    const parecidos = validos(`${tema.id}|tipo:${tipo}`);
    if (parecidos.length < VARIANTES_POR_TIPO) return "";
    contarUso("fundo-reaproveitado", "-");
    return absoluta(parecidos[Math.floor(rng() * parecidos.length) % parecidos.length].url);
  }
  /** Guarda um fundo recém-gerado (só arquivo salvo neste servidor) para as próximas cenas iguais ou do mesmo tipo. */
  function guardarFundo(tema, cena, url) {
    const rel = relativa(url);
    if (!rel || !tema || !cena || !existe(rel)) return;
    const inserir = db.prepare("INSERT INTO fundos (chave, url, criadoEm) VALUES (?, ?, ?)");
    inserir.run(`${tema.id}|${slug(cena)}`, rel, Date.now());
    const tipo = tipoDeLugar(cena);
    if (tipo) inserir.run(`${tema.id}|tipo:${tipo}`, rel, Date.now());
  }

  // ── Medição do uso da IA ──
  // se a tabela não servir (banco com um formato inesperado), a medição fica desligada e o jogo segue
  let somar = null;
  try {
    somar = db.prepare(`INSERT INTO uso_ia_diario (dia, tipo, modelo, chamadas, entrada, saida, custo) VALUES (?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT (dia, tipo, modelo) DO UPDATE SET chamadas = chamadas + 1, entrada = entrada + excluded.entrada, saida = saida + excluded.saida, custo = custo + excluded.custo`);
  } catch (e) { console.error("[melhorias] medição de uso desligada:", e.message); }
  /** Soma uma chamada no dia (tokens e custo vêm do campo "usage" da resposta, quando o provedor manda). */
  function medir({ tipo, modelo, uso }) {
    if (!somar) return;
    try {
      const n = (v) => Math.max(0, Math.round(Number(v)) || 0);
      somar.run(new Date().toISOString().slice(0, 10), curto(tipo, 30) || "texto", curto(modelo, 80) || "?", n(uso?.prompt_tokens), n(uso?.completion_tokens), Math.max(0, Number(uso?.cost) || 0));
    } catch (e) { console.error("[uso]", e.message); }
  }
  M.definirMedidor(medir);

  // ── Mesa que vai para o app ──
  /** O mundo guarda segredos (fatos, encontro à espera): só o clima e o período saem do servidor. */
  function mesaPublica(mesa) {
    const mundo = normalizarMundo(mesa.mundo);
    delete mesa.mundo;
    mesa.clima = mundo.clima;
    mesa.periodo = mundo.periodo;
  }
  const aoReiniciar = (codigo) => {
    salvarMesa(codigo, { mundo: null });
    for (const r of db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo)) {
      const f = json(r.dados);
      if (f && Array.isArray(f.status)) { delete f.status; salvarFicha(codigo, { ...f, uid: r.uid }); }
    }
  };

  // ── Admin: depuração e uso ──
  if (app && adminMw) {
    const mesaAdmin = (req, res) => {
      const codigo = String(req.params.codigo || "").toUpperCase();
      const m = db.prepare("SELECT codigo, fase, ato, arcoConcluido, dia, cena, mundo FROM mesas WHERE codigo = ?").get(codigo);
      if (!m) { erro(res, 404, "Mesa não encontrada."); return null; }
      return m;
    };
    const resposta = (m) => ({ codigo: m.codigo, fase: m.fase, ato: M.numAto(m.ato), concluida: !!Number(m.arcoConcluido), dia: Math.max(1, Number(m.dia) || 1), cena: m.cena || "",
      mundo: normalizarMundo(m.mundo), climas: CLIMAS, periodos: PERIODOS, encontros: ENCONTROS });
    app.get("/api/admin/mesas/:codigo/mundo", adminMw, (req, res) => { const m = mesaAdmin(req, res); if (m) res.json(resposta(m)); });
    /** Força clima, período, ato, fatos, NPCs, reputação e o próximo encontro, para testar sem jogar a aventura inteira. */
    app.put("/api/admin/mesas/:codigo/mundo", adminMw, (req, res) => {
      const m = mesaAdmin(req, res); if (!m) return;
      const b = objeto(req.body) || {};
      const mundo = b.limpar === true ? normalizarMundo(null) : normalizarMundo(m.mundo);
      if (b.clima !== undefined) mundo.clima = CLIMAS.includes(b.clima) ? b.clima : "";
      if (b.periodo !== undefined) mundo.periodo = PERIODOS.includes(b.periodo) ? b.periodo : "";
      if (b.encontro !== undefined) mundo.encontro = b.encontro === true ? sortearEncontro() : curto(b.encontro, 200);
      aplicarMemoria(mundo, { fatos: b.fatos, npcs: b.npcs });
      for (const [k, v] of Object.entries(objeto(b.reputacao) || {}).slice(0, MAX_FACCOES)) {
        const grupo = curto(k, 30);
        if (!grupo) continue;
        if (v === null) delete mundo.reputacao[grupo];
        else if (grupo in mundo.reputacao || Object.keys(mundo.reputacao).length < MAX_FACCOES) mundo.reputacao[grupo] = inteiro(v, -REPUTACAO_MAX, REPUTACAO_MAX, 0);
      }
      const campos = { mundo: normalizarMundo(mundo) };
      if (b.ato !== undefined && m.fase === "jogo") { campos.ato = inteiro(b.ato, 1, 3, 1); campos.arcoConcluido = 0; }
      salvarMesa(m.codigo, campos);
      broadcast(m.codigo, "atualizar", {});
      res.json(resposta(mesaAdmin(req, res)));
    });
    /** Uso da IA por dia, tipo e modelo (últimos `dias`, 30 por padrão), com o total do período. */
    app.get("/api/admin/uso", adminMw, (req, res) => {
      const dias = inteiro(req.query.dias, 1, 365, 30);
      const desde = new Date(Date.now() - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
      const linhas = db.prepare("SELECT dia, tipo, modelo, chamadas, entrada, saida, custo FROM uso_ia_diario WHERE dia >= ? ORDER BY dia DESC, tipo, modelo").all(desde);
      const total = {};
      for (const l of linhas) {
        const t = total[l.tipo] || (total[l.tipo] = { chamadas: 0, entrada: 0, saida: 0, custo: 0 });
        t.chamadas += l.chamadas; t.entrada += l.entrada; t.saida += l.saida; t.custo += l.custo;
      }
      res.json({ dias, desde, total, linhas });
    });
  }

  return {
    bloco, medir, mundoDaMesa,
    aoNarrar: seguro("aoNarrar", aoNarrar),
    aoMontarRolagem: seguro("aoMontarRolagem", aoMontarRolagem, (ctx, rol) => rol),
    opcoesDeRolagem: seguro("opcoesDeRolagem", opcoesDeRolagem, () => ({})),
    opcoesDeTurno: seguro("opcoesDeTurno", opcoesDeTurno, () => ({ mudadas: new Set() })),
    aoFimDoCombate: seguro("aoFimDoCombate", aoFimDoCombate),
    fundoPronto: seguro("fundoPronto", fundoPronto, ""),
    guardarFundo: seguro("guardarFundo", guardarFundo),
    mesaPublica: seguro("mesaPublica", mesaPublica, (mesa) => { delete mesa.mundo; }),
    aoReiniciar: seguro("aoReiniciar", aoReiniciar),
  };
}

module.exports = {
  CLIMAS, PERIODOS, ENCONTROS, INTERVALO_DE_ENCONTROS, TIPOS_DE_LUGAR, VARIANTES_POR_TIPO, NOME_STATUS,
  normalizarMundo, aplicarMemoria, chaveDeFato, nomeDaReputacao, sortearEncontro, ajusteDoAmbiente, chanceDeSucesso,
  elementoDoNome, danoComElemento, aplicarStatus, processarStatus, temStatus, inimigoFoge, seloDaRolagem, tipoDeLugar, slug, instalar,
};
