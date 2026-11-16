/**
 * Progressão do personagem além do nível: talentos passivos, subclasses e redistribuição de atributos.
 *
 * Tudo aqui é acréscimo: a ficha só ganha os campos novos (`talentos`, `subclasse`, `redistribuicoes`, `escolhas`,
 * `bonus`) quando eles existem, então fichas antigas e apps antigos continuam como eram.
 *
 *   - Talentos: um a cada 2 níveis (níveis 2, 4, 6…), de uma lista curta. Efeito de uma linha.
 *   - Subclasse: uma entre duas da classe, a partir do nível 3. Bônus passivo.
 *   - Redistribuir: troca os pontos de atributo de lugar (a soma não muda). A primeira vez é grátis; as outras custam ouro.
 *
 * Este arquivo não depende de regras.js (é regras.js que usa as contas daqui).
 */
"use strict";

const NIVEL_DA_SUBCLASSE = 3;
const NIVEL_DE_CHEFE_PV = 40;                // inimigo com 40 PV ou mais conta como chefe
const ATRIBUTOS = ["for", "des", "con", "int", "sab", "car"];
const MINIMO_AO_REDISTRIBUIR = 8;            // não dá para baixar um atributo abaixo de 8 (o que já está abaixo pode ficar)

const TALENTOS = {
  aprendizado_rapido: { nome: "Aprendizado Rápido", nomeEn: "Quick Learner", descricao: "+25% de XP.", descricaoEn: "+25% XP." },
  cacador_de_gigantes: { nome: "Caçador de Gigantes", nomeEn: "Giant Slayer", descricao: "+2 de dano contra chefes.", descricaoEn: "+2 damage against bosses." },
  sede_de_sangue: { nome: "Sede de Sangue", nomeEn: "Bloodthirst", descricao: "Recupera 1 PV a cada ataque que acerta.", descricaoEn: "Regain 1 HP on every attack that hits." },
  ultimo_suspiro: { nome: "Último Suspiro", nomeEn: "Last Breath", descricao: "Uma vez por combate, fica com 1 PV em vez de cair.", descricaoEn: "Once per combat, stay at 1 HP instead of falling." },
  pele_de_espinhos: { nome: "Pele de Espinhos", nomeEn: "Thorned Hide", descricao: "Quem acerta você sofre 1d4 de dano.", descricaoEn: "Whoever hits you takes 1d4 damage." },
  olhar_atento: { nome: "Olhar Atento", nomeEn: "Keen Eye", descricao: "Crítico com 19 ou 20 no dado.", descricaoEn: "Critical hit on a 19 or 20." },
  pes_ligeiros: { nome: "Pés Ligeiros", nomeEn: "Fleet Feet", descricao: "+2 na iniciativa.", descricaoEn: "+2 to initiative." },
  couraca: { nome: "Couraça", nomeEn: "Thick Skin", descricao: "+1 na CA.", descricaoEn: "+1 AC." },
  negociador: { nome: "Negociador", nomeEn: "Haggler", descricao: "+20% de ouro nas vitórias.", descricaoEn: "+20% gold from victories." },
};

// Nomes neutros de propósito: servem em qualquer tema (fantasia, espaço, faroeste…)
const SUBCLASSES = {
  Guerreiro: {
    campeao: { nome: "Campeão", nomeEn: "Champion", descricao: "Crítico com 19 ou 20 no dado.", descricaoEn: "Critical hit on a 19 or 20.", critMin: 19 },
    guardiao: { nome: "Guardião", nomeEn: "Guardian", descricao: "+1 na CA.", descricaoEn: "+1 AC.", ca: 1 },
  },
  Ladino: {
    assassino: { nome: "Assassino", nomeEn: "Assassin", descricao: "+2 de dano nos ataques.", descricaoEn: "+2 damage on attacks.", dano: 2 },
    trapaceiro: { nome: "Trapaceiro", nomeEn: "Trickster", descricao: "+2 em Prestidigitação e Furtividade.", descricaoEn: "+2 to Sleight of Hand and Stealth.", pericias: { Prestidigitação: 2, Furtividade: 2 } },
  },
  Mago: {
    destruidor: { nome: "Destruidor", nomeEn: "Destroyer", descricao: "+2 de dano com magias.", descricaoEn: "+2 damage with spells.", danoMagia: 2 },
    protetor: { nome: "Protetor", nomeEn: "Warden", descricao: "+1 na CA e +1 em Arcanismo.", descricaoEn: "+1 AC and +1 to Arcana.", ca: 1, pericias: { Arcanismo: 1 } },
  },
  Clérigo: {
    curandeiro: { nome: "Curandeiro", nomeEn: "Healer", descricao: "+2 em toda cura que você conjura.", descricaoEn: "+2 to every healing spell you cast.", cura: 2 },
    combatente: { nome: "Combatente", nomeEn: "Battler", descricao: "+1 nos ataques.", descricaoEn: "+1 to attacks." , ataque: 1 },
  },
};

const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const idDe = (x) => (x && typeof x === "object" ? String(x.id ?? "") : String(x ?? ""));

/** Quantos talentos o nível dá ao todo: um a cada 2 níveis. */
const talentosDoNivel = (nivel) => Math.floor(Math.max(1, Number(nivel) || 1) / 2);

/** Talentos válidos, sem repetir e dentro do que o nível dá (aceita ids ou objetos com `id`). */
function talentosValidos(v, nivel) {
  const saida = [];
  for (const x of Array.isArray(v) ? v : []) { const id = idDe(x); if (TALENTOS[id] && !saida.includes(id)) saida.push(id); }
  return saida.slice(0, talentosDoNivel(nivel));
}

/** Subclasse válida para a classe e o nível, ou "". */
function subclasseValida(v, classe, nivel) {
  const id = idDe(v);
  return (Number(nivel) || 1) >= NIVEL_DA_SUBCLASSE && SUBCLASSES[classe]?.[id] ? id : "";
}

/**
 * O que a ficha guarda de progressão, já conferido: { talentos, subclasse, redistribuicoes, escolhas, bonus }.
 * `escolhas` (o que falta escolher) e `bonus` (somas para o app mostrar) são nulos quando não há nada.
 */
function daFicha(v, classe, nivel) {
  const talentos = talentosValidos(v?.talentos, nivel);
  const subclasse = subclasseValida(v?.subclasse, classe, nivel);
  const redistribuicoes = Math.max(0, Math.min(999, Math.floor(Number(v?.redistribuicoes)) || 0));
  const vagas = Math.min(talentosDoNivel(nivel), Object.keys(TALENTOS).length) - talentos.length;
  const faltaSubclasse = (Number(nivel) || 1) >= NIVEL_DA_SUBCLASSE && !subclasse && !!SUBCLASSES[classe];
  const escolhas = {};
  if (vagas > 0) escolhas.talentos = vagas;
  if (faltaSubclasse) escolhas.subclasse = true;
  const e = efeitos({ classe, talentos, subclasse });
  const bonus = {};
  for (const k of ["ca", "ataque", "dano", "danoMagia", "cura", "iniciativa"]) if (e[k]) bonus[k] = e[k];
  if (e.critMin < 20) bonus.critMin = e.critMin;
  if (Object.keys(e.pericias).length) bonus.pericias = e.pericias;
  return { talentos, subclasse, redistribuicoes, escolhas: Object.keys(escolhas).length ? escolhas : null, bonus: Object.keys(bonus).length ? bonus : null };
}

/** Somas dos talentos e da subclasse de uma ficha. Sem nada escolhido, tudo neutro. */
function efeitos(f) {
  const e = { ca: 0, ataque: 0, dano: 0, danoMagia: 0, danoChefe: 0, cura: 0, critMin: 20, iniciativa: 0, xpMult: 1, ouroMult: 1, pericias: {}, talentos: new Set() };
  if (!f || typeof f !== "object") return e;
  const sub = SUBCLASSES[f.classe]?.[idDe(f.subclasse)];
  if (sub) {
    e.ca += sub.ca || 0; e.ataque += sub.ataque || 0; e.dano += sub.dano || 0; e.danoMagia += sub.danoMagia || 0; e.cura += sub.cura || 0;
    if (sub.critMin) e.critMin = Math.min(e.critMin, sub.critMin);
    for (const [p, b] of Object.entries(sub.pericias || {})) e.pericias[p] = (e.pericias[p] || 0) + b;
  }
  for (const x of Array.isArray(f.talentos) ? f.talentos : []) { const id = idDe(x); if (TALENTOS[id]) e.talentos.add(id); }
  if (e.talentos.has("couraca")) e.ca += 1;
  if (e.talentos.has("olhar_atento")) e.critMin = Math.min(e.critMin, 19);
  if (e.talentos.has("aprendizado_rapido")) e.xpMult = 1.25;
  if (e.talentos.has("pes_ligeiros")) e.iniciativa += 2;
  if (e.talentos.has("negociador")) e.ouroMult = 1.2;
  if (e.talentos.has("cacador_de_gigantes")) e.danoChefe = 2;
  return e;
}
const temTalento = (f, id) => (Array.isArray(f?.talentos) ? f.talentos : []).some((x) => idDe(x) === id);
const ehChefe = (inimigo) => (Number(inimigo?.pvMax) || 0) >= NIVEL_DE_CHEFE_PV;

/** Bônus de uma perícia vindo da subclasse (0 se não tem). */
function bonusDePericia(f, pericia) {
  const k = chave(pericia);
  for (const [p, b] of Object.entries(efeitos(f).pericias)) if (chave(p) === k) return b;
  return 0;
}

/**
 * Rolagem recém-montada: soma o bônus de ataque ou de perícia e guarda de quanto é o crítico e o dano extra.
 * Só mexe na rolagem quando a ficha tem algum efeito (uma ficha sem talentos sai igual).
 */
function aoMontarRolagem(f, rol, { magia = false } = {}) {
  if (!rol || typeof rol !== "object" || !f) return rol;
  const e = efeitos(f);
  if (rol.tipo === "ataque") {
    if (e.ataque) rol.bonus = (rol.bonus || 0) + e.ataque;
    if (e.critMin < 20) rol.critMin = e.critMin;
    const extra = e.dano + (magia ? e.danoMagia : 0);
    if (extra) rol.danoExtra = extra;
    if (e.danoChefe) rol.danoChefe = e.danoChefe;
  } else {
    const b = bonusDePericia(f, String(rol.rotulo || ""));
    if (b) rol.bonus = (rol.bonus || 0) + b;
  }
  return rol;
}

/**
 * Junta o ajuste de dano que já existia (elementos) com os talentos: dano extra, caçador de gigantes e sede de sangue.
 * `base` é o objeto de opções de regras.resolverRolagem; devolve um novo, sem mexer no original.
 */
function opcoesDeRolagem(f, base = {}, aoMudarFicha = () => {}) {
  const sede = temTalento(f, "sede_de_sangue");
  return {
    ...base,
    ajustarDano(rol, alvo, dano, critico) {
      const r = (base.ajustarDano ? base.ajustarDano(rol, alvo, dano, critico) : null) || { dano };
      let total = Number.isFinite(r.dano) ? r.dano : dano;
      // imune (dano 0 pelo elemento) continua imune: o bônus só entra quando o golpe fere
      if (total > 0) total += (Number(rol.danoExtra) || 0) + (ehChefe(alvo) ? Number(rol.danoChefe) || 0 : 0);
      const depoisBase = r.depois;
      const avisos = Array.isArray(r.avisos) ? r.avisos : [];
      return {
        ...r, dano: total, avisos,
        depois() {
          if (depoisBase) depoisBase();
          if (sede && total > 0 && f.pv > 0 && f.pv < f.pvMax) {
            f.pv = Math.min(f.pvMax, f.pv + 1);
            avisos.push(`${f.nome} recupera 1 PV (Sede de Sangue).`);
            aoMudarFicha(f);
          }
        },
      };
    },
  };
}

/**
 * Opções para regras.passarVez: CA extra de talentos e subclasse, e o que acontece quando um inimigo acerta
 * (Último Suspiro e Pele de Espinhos). `rolar(expr)` devolve o total de um dado.
 */
function opcoesDeTurno(rolar) {
  return {
    bonusFixoCA: (alvo) => efeitos(alvo).ca,
    aoAcertar(inimigo, alvo, dano, c) {
      const linhas = [];
      if (alvo.pv <= 0 && temTalento(alvo, "ultimo_suspiro")) {
        c.suspiro = c.suspiro && typeof c.suspiro === "object" ? c.suspiro : {};
        if (!c.suspiro[alvo.uid]) {
          c.suspiro[alvo.uid] = true;
          alvo.pv = 1;
          linhas.push(`${alvo.nome} resiste por um fio e fica com 1 PV (Último Suspiro).`);
        }
      }
      if (dano > 0 && inimigo.pv > 0 && temTalento(alvo, "pele_de_espinhos")) {
        const v = Math.max(1, Number(rolar("1d4")) || 1);
        inimigo.pv = Math.max(0, inimigo.pv - v);
        linhas.push(`${inimigo.nome} se fere nos espinhos de ${alvo.nome} e perde ${v} PV${inimigo.pv <= 0 ? " — e cai" : ""}.`);
      }
      return linhas;
    },
  };
}

/** Preço em ouro de redistribuir os atributos: a primeira vez é grátis. */
const custoDeRedistribuir = (f) => ((Number(f?.redistribuicoes) || 0) < 1 ? 0 : 50 + 25 * (Number(f?.nivel) || 1));

/**
 * Confere uma redistribuição. Devolve { erro } ou { atributos }.
 * A soma tem de ser a mesma; cada atributo vai de 8 a 20 (um que já está abaixo de 8 pode ficar onde está ou subir).
 */
function conferirRedistribuicao(f, pedido) {
  if (!pedido || typeof pedido !== "object" || Array.isArray(pedido)) return { erro: "Mande os seis atributos." };
  const novos = {};
  let somaNova = 0, somaAtual = 0, mudou = false;
  for (const a of ATRIBUTOS) {
    const v = pedido[a], atual = Number(f.atributos?.[a]) || 10;
    if (!Number.isInteger(v)) return { erro: "Mande os seis atributos, em números inteiros." };
    const minimo = Math.min(MINIMO_AO_REDISTRIBUIR, atual);
    if (v < minimo) return { erro: `${a.toUpperCase()} não pode ficar abaixo de ${minimo}.` };
    if (v > 20) return { erro: `${a.toUpperCase()} não pode passar de 20.` };
    novos[a] = v; somaNova += v; somaAtual += atual;
    if (v !== atual) mudou = true;
  }
  if (somaNova !== somaAtual) return { erro: `A soma dos atributos tem de continuar ${somaAtual} (a sua deu ${somaNova}).` };
  if (!mudou) return { erro: "Os atributos ficaram iguais: mude algum ponto de lugar." };
  return { atributos: novos };
}

const noIdioma = (x, en) => ({ nome: en ? x.nomeEn : x.nome, descricao: en ? x.descricaoEn : x.descricao });

/** O que a tela de progressão do app mostra para uma ficha. */
function painel(f, idioma = "pt") {
  const en = idioma === "en";
  const meus = new Set(talentosValidos(f.talentos, f.nivel));
  const subs = SUBCLASSES[f.classe] || {};
  const atual = subclasseValida(f.subclasse, f.classe, f.nivel);
  const vagas = Math.max(0, Math.min(talentosDoNivel(f.nivel), Object.keys(TALENTOS).length) - meus.size);
  return {
    nivel: f.nivel,
    talentos: { vagas, total: talentosDoNivel(f.nivel), proximoNivel: f.nivel >= 20 ? null : (f.nivel % 2 === 0 ? f.nivel + 2 : f.nivel + 1),
      lista: Object.entries(TALENTOS).map(([id, t]) => ({ id, ...noIdioma(t, en), tem: meus.has(id) })) },
    subclasse: { nivelMinimo: NIVEL_DA_SUBCLASSE, atual, podeEscolher: f.nivel >= NIVEL_DA_SUBCLASSE && !atual && Object.keys(subs).length > 0,
      lista: Object.entries(subs).map(([id, s]) => ({ id, ...noIdioma(s, en) })) },
    redistribuir: { custo: custoDeRedistribuir(f), gratis: custoDeRedistribuir(f) === 0, ouro: f.ouro || 0, vezes: Number(f.redistribuicoes) || 0,
      minimo: MINIMO_AO_REDISTRIBUIR, maximo: 20, atributos: { ...f.atributos } },
  };
}

/**
 * Liga as rotas. `d`: { app, db, authMw, mesaDoMembro, salvarFicha, registrar, broadcast, erro, json, R, idiomaDe }.
 */
function instalar(d) {
  const { app, db, authMw, mesaDoMembro, salvarFicha, registrar, broadcast, erro, json, R } = d;
  const idiomaDe = d.idiomaDe || (() => "pt");
  const fichaDe = (codigo, uid) => {
    const row = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, uid);
    return row ? R.normalizarFicha(json(row.dados), uid) : null;
  };
  const responder = (req, res, codigo, f) => {
    broadcast(codigo, "ficha", { uid: req.uid });
    res.json({ ok: true, ficha: f, progressao: painel(f, idiomaDe(req)) });
  };

  /** Talentos, subclasses e o preço de redistribuir, para a ficha de quem chama. */
  app.get("/api/mesa/:codigo/progressao", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const f = fichaDe(codigo, req.uid);
    if (!f) return erro(res, 400, "Crie seu personagem.");
    res.json(painel(f, idiomaDe(req)));
  });

  /** Escolhe um talento (um a cada 2 níveis). Não gasta ação; vale dentro e fora de combate. */
  app.post("/api/talento", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const f = fichaDe(codigo, req.uid);
    if (!f) return erro(res, 400, "Crie seu personagem.");
    const id = String(req.body?.id ?? "");
    const t = TALENTOS[id];
    if (!t) return erro(res, 400, "Esse talento não existe.");
    if (temTalento(f, id)) return erro(res, 409, `Você já tem ${t.nome}.`);
    if (!f.escolhas?.talentos) return erro(res, 409, f.nivel < 2 ? "O primeiro talento vem no nível 2." : "Você não tem talento para escolher agora. O próximo vem a cada 2 níveis.");
    const nova = R.normalizarFicha({ ...f, talentos: [...(f.talentos || []), id] }, req.uid);
    salvarFicha(codigo, nova);
    registrar(codigo, { tipo: "sys", texto: `${f.nome} aprendeu o talento ${t.nome}: ${t.descricao}`, ok: true });
    responder(req, res, codigo, nova);
  });

  /** Escolhe a subclasse (uma vez, a partir do nível 3). */
  app.post("/api/subclasse", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const f = fichaDe(codigo, req.uid);
    if (!f) return erro(res, 400, "Crie seu personagem.");
    const id = String(req.body?.id ?? "");
    if (f.subclasse) return erro(res, 409, "Você já escolheu sua especialização.");
    if (f.nivel < NIVEL_DA_SUBCLASSE) return erro(res, 409, `A especialização vem no nível ${NIVEL_DA_SUBCLASSE}.`);
    const s = SUBCLASSES[f.classe]?.[id];
    if (!s) return erro(res, 400, "Essa especialização não é da sua classe.");
    const nova = R.normalizarFicha({ ...f, subclasse: id }, req.uid);
    salvarFicha(codigo, nova);
    registrar(codigo, { tipo: "sys", texto: `${f.nome} se especializou: ${s.nome}. ${s.descricao}`, ok: true });
    responder(req, res, codigo, nova);
  });

  /** Redistribui os atributos (mesma soma). Grátis na primeira vez; depois custa ouro. Só fora de combate. */
  app.post("/api/redistribuir", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const f = fichaDe(codigo, req.uid);
    if (!f) return erro(res, 400, "Crie seu personagem.");
    const mesa = db.prepare("SELECT fase, combate, rolagem FROM mesas WHERE codigo = ?").get(codigo);
    if (mesa.fase !== "jogo") return erro(res, 409, "No saguão você ainda pode editar a ficha à vontade.");
    if (json(mesa.combate)) return erro(res, 409, "Não dá para redistribuir no meio do combate.");
    if (json(mesa.rolagem)?.jogador === req.uid) return erro(res, 409, "Role o dado pendente antes de redistribuir.");
    const r = conferirRedistribuicao(f, req.body?.atributos);
    if (r.erro) return erro(res, 400, r.erro);
    const custo = custoDeRedistribuir(f);
    if ((f.ouro || 0) < custo) return erro(res, 409, `Falta ouro: redistribuir custa ${custo} e você tem ${f.ouro || 0}.`);
    const nova = R.normalizarFicha({ ...f, atributos: r.atributos, ouro: (f.ouro || 0) - custo, redistribuicoes: (Number(f.redistribuicoes) || 0) + 1 }, req.uid);
    // vida e mana acompanham o novo máximo, sem levantar quem está caído
    nova.pv = f.pv <= 0 ? 0 : Math.max(1, Math.min(nova.pvMax, f.pv + (nova.pvMax - f.pvMax)));
    nova.mana = Math.max(0, Math.min(nova.manaMax, f.mana + (nova.manaMax - f.manaMax)));
    salvarFicha(codigo, nova);
    registrar(codigo, { tipo: "sys", texto: `${f.nome} redistribuiu os atributos${custo ? ` (−${custo} de ouro)` : ""}.` });
    responder(req, res, codigo, nova);
  });

  return { painel };
}

module.exports = {
  TALENTOS, SUBCLASSES, NIVEL_DA_SUBCLASSE, MINIMO_AO_REDISTRIBUIR,
  talentosDoNivel, talentosValidos, subclasseValida, daFicha, efeitos, temTalento, ehChefe, bonusDePericia,
  aoMontarRolagem, opcoesDeRolagem, opcoesDeTurno, custoDeRedistribuir, conferirRedistribuicao, painel, instalar,
};
