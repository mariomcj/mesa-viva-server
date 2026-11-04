/**
 * Motor de regras do Mesa Viva — d20 simplificado, inspirado no SRD 5.1 (CC-BY-4.0).
 * Portado de TypeScript para JavaScript.
 */
"use strict";

const ATRIBUTOS = ["for", "des", "con", "int", "sab", "car"];
const NOME_ATRIBUTO = { for: "Força", des: "Destreza", con: "Constituição", int: "Inteligência", sab: "Sabedoria", car: "Carisma" };
const PERICIAS = {
  Acrobacia: "des", "Adestrar Animais": "sab", Arcanismo: "int", Atletismo: "for", Atuação: "car",
  Enganação: "car", Furtividade: "des", História: "int", Intimidação: "car", Intuição: "sab",
  Investigação: "int", Medicina: "sab", Natureza: "int", Percepção: "sab", Persuasão: "car",
  Prestidigitação: "des", Religião: "int", Sobrevivência: "sab",
};
const RACAS = ["Humano", "Anão", "Elfo", "Halfling", "Meio-orc"];
const CLASSES = ["Guerreiro", "Ladino", "Mago", "Clérigo"];
const SEXOS = ["Masculino", "Feminino", "Outro"];
const DADO_DE_VIDA = { Guerreiro: 10, Clérigo: 8, Ladino: 8, Mago: 6 };

function _ataquesPorClasse(classe, fornecidos) {
  const validos = fornecidos.map((a) => ({ nome: safeStr(a.nome, "", 30), bonus: Math.max(-5, Math.min(15, Number(a.bonus) || 0)), dano: String(a.dano || "1d4") })).slice(0, 6);
  if (validos.length > 0) return validos;
  const PADRAO = {
    Guerreiro: [
      { nome: "Espada longa", bonus: 3, dano: "1d8+2" },
      { nome: "Golpe de escudo", bonus: 2, dano: "1d6+1" },
    ],
    Ladino: [
      { nome: "Adaga", bonus: 3, dano: "1d6" },
      { nome: "Arco curto", bonus: 2, dano: "1d6+1" },
    ],
    Mago: [
      { nome: "Cajado", bonus: 1, dano: "1d4" },
      { nome: "Centelha Arcana", bonus: 3, dano: "1d6" },
    ],
    Clérigo: [
      { nome: "Martelo", bonus: 2, dano: "1d6+1" },
      { nome: "Luz Sagrada", bonus: 3, dano: "1d6" },
    ],
  };
  return (PADRAO[classe] || PADRAO.Guerreiro).slice(0, 6);
}

function safeStr(v, def, max) {
  let s = String(v ?? def);
  // Remove control chars
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uFFFE\uFFFF\uFFFD]/g, "");
  // Remove lone surrogates (high without low, low without high)
  s = s.replace(/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/g, "");
  // Truncate preserving surrogate pairs
  if (s.length > max) {
    s = s.substring(0, max);
    const last = s.charCodeAt(max - 1);
    if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, max - 1);
  }
  return s;
}

function mod(valor) {
  const n = Number(valor ?? 10);
  return Math.floor((n - 10) / 2);
}

function sinal(n) {
  return n >= 0 ? "+" : "";
}

const d = (faces, rng = Math.random) => 1 + Math.floor(rng() * faces);

/**
 * Rola expressão como "2d6+3" ou "1d8-1". Em crítico, dobra dados (não bônus).
 */
function rolar(expr, critico = false, rng = Math.random) {
  const s = String(expr || "1d4").replace(/\s/g, "").toLowerCase();
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
  let total = 0;
  const dados = [];
  let m;
  while ((m = re.exec(s))) {
    if (m[3]) {
      const qtd = Math.min(40, Number(m[2] || 1) * (critico ? 2 : 1));
      const faces = Math.max(1, Math.min(100, Number(m[3])));
      const sg = m[1] === "-" ? -1 : 1;
      for (let i = 0; i < qtd; i++) { const r = d(faces, rng); dados.push(r); total += sg * r; }
    } else if (m[5]) {
      total += (m[4] === "-" ? -1 : 1) * Number(m[5]);
    }
  }
  return { total: Math.max(0, total), dados };
}

function bonusPericia(f, pericia) {
  const atr = PERICIAS[pericia] ?? "sab";
  const treinada = (f.pericias || []).some((p) => p.toLowerCase() === pericia.toLowerCase());
  return mod(f.atributos?.[atr]) + (treinada ? f.proficiencia || 2 : 0);
}

/**
 * Gera ficha a partir do JSON da IA + conceito.
 */
function normalizarFicha(dados, uid, conceito) {
  const v = dados || {};
  const at = {};
  for (const a of ATRIBUTOS) at[a] = Math.max(3, Math.min(20, Number(v.atributos?.[a]) || 10));
  // Enforce sum ≤ 72 — scale down progressively from highest attributes
  const MAX_SOMA = 72;
  let soma = ATRIBUTOS.reduce((s, a) => s + at[a], 0);
  if (soma > MAX_SOMA) {
    let excedente = soma - MAX_SOMA;
    while (excedente > 0) {
      const ordem = [...ATRIBUTOS].sort((a, b) => at[b] - at[a]);
      let mexeu = false;
      for (const a of ordem) {
        if (excedente <= 0) break;
        if (at[a] > 3) { at[a]--; excedente--; mexeu = true; }
      }
      if (!mexeu) break;
    }
  }
  const classe = CLASSES.includes(v.classe) ? v.classe : "Guerreiro";
  const lvl = Math.max(1, Math.min(20, Number(v.nivel) || 1));
  const dv = DADO_DE_VIDA[classe] || 8;
  const pvMax = dv + mod(at.con) + (lvl - 1) * (Math.floor(dv / 2) + 1 + mod(at.con));
  return {
    uid,
    xp: 0,
    nivel: 1,
    nome: safeStr(v.nome, "Herói", 30),
    sexo: SEXOS.includes(v.sexo) ? v.sexo : "Masculino",
    raca: RACAS.includes(v.raca) ? v.raca : "Humano",
    classe,
    antecedente: safeStr(v.antecedente, "", 30),
    nivel: lvl,
    proficiencia: Math.ceil(1 + lvl / 4),
    atributos: at,
    pvMax: Math.max(1, pvMax),
    pv: Math.min(Number(v.pv) > 0 ? Number(v.pv) : pvMax, pvMax),
    ca: Math.max(10, Number(v.ca) || 10),
    imagem: safeStr(v.imagem, "", 500),
    pericias: (Array.isArray(v.pericias) ? v.pericias : []).filter((p) => PERICIAS[p]).slice(0, Math.max(1, 2 + mod(at.int))),
    ataques: _ataquesPorClasse(classe, Array.isArray(v.ataques) ? v.ataques : []),
    magias: (Array.isArray(v.magias) ? v.magias : []).map((m) => ({ nome: safeStr(m.nome, "", 30), descricao: safeStr(m.descricao, "", 300) })).slice(0, 10),
    equipamento: (Array.isArray(v.equipamento) ? v.equipamento : []).map((s) => safeStr(s, "", 50)).slice(0, 12),
    tracos: {
      personalidade: safeStr(v.tracos?.personalidade, "", 200),
      ideal: safeStr(v.tracos?.ideal, "", 200),
      vinculo: safeStr(v.tracos?.vinculo, "", 200),
      defeito: safeStr(v.tracos?.defeito, "", 200),
    },
    dica: safeStr(v.dica, "", 200),
    conceito: conceito || safeStr(v.conceito, "", 300),
    notas: safeStr(v.notas, "", 1000),
  };
}

/**
 * Rolagem de iniciativa (d20 + DES).
 */
function iniciativa(ficha) {
  return d(20) + mod(ficha.atributos.des);
}

function criarInimigo(id, dados) {
  return {
    id, nome: dados.nome, pv: Math.max(1, dados.pv || 7),
    pvMax: Math.max(1, dados.pv || 7), ca: Math.max(10, dados.ca || 13),
    ataque: Number(dados.ataque) || 4, dano: dados.dano || "1d6+2", des: Number(dados.des) || 2,
  };
}

function iniciarCombate(jogadores, inimigosDados) {
  const ordem = [];
  for (const f of Object.values(jogadores)) {
    if (!f.pv || f.pv <= 0) continue;
    ordem.push({ id: f.uid, tipo: "pj", nome: f.nome, ini: d(20) + mod(f.atributos.des) });
  }
  const inimigos = inimigosDados.map((d, i) => criarInimigo(`ini_${i}`, d));
  for (const i of inimigos) ordem.push({ id: i.id, tipo: "ini", nome: i.nome, ini: d(20) + i.des });
  ordem.sort((a, b) => b.ini - a.ini || Math.random() - 0.5);
  return { rodada: 1, vez: 0, ordem, inimigos, inicioVez: Date.now() };
}

function vezAtual(combate) {
  if (!combate || !combate.ordem?.length) return null;
  return combate.ordem[combate.vez % combate.ordem.length];
}

function combateAcabou(combate, fichas) {
  if (!combate) return true;
  if (!combate.inimigos?.some((i) => i.pv > 0)) return true;
  if (fichas) {
    const pjsVivos = Object.values(fichas).filter((f) => f.pv > 0).length;
    if (pjsVivos === 0) return true;
  }
  return false;
}

function montarRolagem(ficha, pedido, combate, id) {
  if (pedido.tipo === "ataque") {
    const a = (ficha.ataques || []).find((at) => at.nome === pedido.ataque);
    if (!a) return null;
    const alvo = combate?.inimigos?.find((i) => i.id === pedido.alvo || i.nome === pedido.alvo);
    return {
      id, jogador: ficha.uid, tipo: "ataque", rotulo: `${a.nome} vs ${alvo ? alvo.nome : "alvo"}`,
      bonus: a.bonus, cd: alvo?.ca ?? 13, motivo: pedido.ataque, dano: a.dano, alvo: alvo?.id,
    };
  }
  const bonus = pedido.tipo === "pericia"
    ? bonusPericia(ficha, pedido.pericia)
    : mod(ficha.atributos[pedido.atributo] ?? 0);
  const rotulo = pedido.tipo === "pericia" ? pedido.pericia : `S${NOME_ATRIBUTO[pedido.atributo] || pedido.atributo}`;
  return {
    id, jogador: ficha.uid, tipo: "teste", rotulo,
    bonus, cd: pedido.cd || 13, motivo: pedido.motivo || "",
  };
}

function resolverRolagem(rol, natural, combate, nomeAtacante) {
  const total = natural + (rol.bonus || 0);
  const sucesso = total >= (rol.cd || 13);
  let dano, descricao;
  if (rol.tipo === "ataque") {
    if (sucesso) {
      const critico = natural === 20;
      const r = rolar(rol.dano || "1d4", critico);
      dano = r.total;
      const alvo = combate?.inimigos?.find((i) => i.id === rol.alvo || i.nome === rol.alvo);
      if (alvo) alvo.pv = Math.max(0, alvo.pv - dano);
      descricao = `${rol.rotulo}: ${natural}${sinal(rol.bonus)}+${rol.bonus} = ${total} vs CA ${rol.cd} — ${critico ? "CRÍTICO! " : ""}${dano} de dano.`;
    } else {
      descricao = `${rol.rotulo}: ${natural}${sinal(rol.bonus)}+${rol.bonus} = ${total} vs CA ${rol.cd} — errou.`;
    }
  } else {
    descricao = `${rol.rotulo}: ${natural}${sinal(rol.bonus)}+${rol.bonus} = ${total} vs CD ${rol.cd} — ${sucesso ? "sucesso" : "falha"}.`;
  }
  return { natural, total, sucesso, dano, descricao };
}

function passarVez(c, fichas, uidAtual) {
  const ocorrido = [];
  // Avança até encontrar um inimigo ou jogador vivo
  let seguranca = 0;
  while (seguranca < 20) {
    seguranca++;
    const atual = vezAtual(c);
    if (!atual) break;
    if (atual.tipo === "pj") {
      // Skip dead PCs
      const f = Object.values(fichas).find((ff) => ff.uid === atual.id);
      if (!f || f.pv <= 0) { c.vez++; continue; }
      // Skip o próprio jogador que já agiu (uidAtual)
      if (atual.id === uidAtual) { c.vez++; continue; }
      break;
    }
    // Turno do inimigo: ataca um jogador aleatório
    const inimigo = c.inimigos.find((i) => i.id === atual.id);
    if (!inimigo || inimigo.pv <= 0) { c.vez++; continue; }
    const alvos = Object.values(fichas).filter((f) => f.pv > 0);
    if (!alvos.length) break;
    const alvo = alvos[Math.floor(Math.random() * alvos.length)];
    const nat = d(20);
    const total = nat + inimigo.ataque;
    const acertou = total >= alvo.ca;
    let dano = 0;
    if (acertou) {
      const r = rolar(inimigo.dano);
      dano = r.total;
      alvo.pv = Math.max(0, alvo.pv - dano);
    }
    const linha = `${inimigo.nome} ataca ${alvo.nome}: ${nat} + ${inimigo.ataque} = ${total} vs CA ${alvo.ca} → ${acertou ? `acertou, ${dano} de dano` : "errou"}`;
    ocorrido.push({ linha, log: { texto: linha, ok: acertou } });
    c.vez++;
    // Se completou a rodada, reseta e continua processando mais NPCs se houver
    if (c.vez >= c.ordem.length) { c.vez = 0; c.rodada++; }
  }
  c.inicioVez = Date.now();
  return ocorrido;
}

module.exports = {
  ATRIBUTOS, NOME_ATRIBUTO, PERICIAS, RACAS, CLASSES, SEXOS, DADO_DE_VIDA,
  mod, sinal, d, rolar, bonusPericia, normalizarFicha, inicio: iniciativa,
  criarInimigo, iniciarCombate, vezAtual, combateAcabou,
  montarRolagem, resolverRolagem, passarVez,
};