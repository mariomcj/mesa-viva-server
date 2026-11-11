/**
 * Novidades que se somam ao jogo, sem trocar nenhum sistema existente:
 *   ouro e saque com raridade depois da vitória, loja da vila, descanso curto,
 *   bestiário, crônica da campanha, pontos de salvamento e epílogo.
 *
 * As regras puras ficam na primeira metade (testáveis sem servidor). `instalar` liga as rotas e devolve
 * os ganchos que o server.js chama em três momentos: combate começou, grupo venceu, ato começou.
 * Os textos do diário continuam em português (o app lê alguns deles).
 */
"use strict";
const R = require("./regras");

// ── Raridade ──
const RARIDADES = ["comum", "incomum", "raro", "epico", "lendario"];
const NOME_RARIDADE = { comum: "Comum", incomum: "Incomum", raro: "Raro", epico: "Épico", lendario: "Lendário" };

/** Chances (em %) de cada raridade pelo nível do personagem: o topo só aparece em níveis altos. */
function chancesDeRaridade(nivel) {
  const n = Math.max(1, Math.min(R.NIVEL_MAXIMO, Number(nivel) || 1));
  if (n <= 2) return { comum: 70, incomum: 26, raro: 4, epico: 0, lendario: 0 };
  if (n <= 4) return { comum: 50, incomum: 34, raro: 13, epico: 3, lendario: 0 };
  if (n <= 6) return { comum: 34, incomum: 36, raro: 21, epico: 8, lendario: 1 };
  return { comum: 22, incomum: 34, raro: 27, epico: 13, lendario: 4 };
}
function sortearRaridade(nivel, rng = Math.random) {
  const ch = chancesDeRaridade(nivel);
  let x = rng() * 100;
  for (const r of RARIDADES) { x -= ch[r]; if (x < 0) return r; }
  return "comum";
}

// ── Itens do saque e da loja (todos usam os tipos e efeitos que o jogo já entende) ──
const POCOES = {
  comum: { nome: "Poção de cura", tipo: "pocao", efeito: "cura 2d4+2", descricao: "Um frasco que fecha ferimentos." },
  incomum: { nome: "Poção de cura maior", tipo: "pocao", efeito: "cura 4d4+4", descricao: "Líquido rubro e espesso; fecha cortes fundos." },
  raro: { nome: "Poção de cura superior", tipo: "pocao", efeito: "cura 6d4+6", descricao: "Brilha de leve no escuro; devolve o fôlego." },
  epico: { nome: "Elixir da vida", tipo: "pocao", efeito: "cura 8d4+10", descricao: "Um gole e a dor vira lembrança." },
  lendario: { nome: "Lágrima da fênix", tipo: "pocao", efeito: "cura 10d4+20", descricao: "Uma gota dourada que levanta quem estava por um fio." },
};
const TONICOS = {
  comum: { nome: "Chá revigorante", tipo: "rapido", efeito: "mana 2", descricao: "Amargo e quente; clareia a cabeça." },
  incomum: { nome: "Tônico de mana", tipo: "rapido", efeito: "mana 4", descricao: "Azul e frio; devolve a energia de conjurar." },
  raro: { nome: "Essência arcana", tipo: "rapido", efeito: "mana 8", descricao: "Um frasco que zumbe baixinho." },
  epico: { nome: "Néctar estelar", tipo: "rapido", efeito: "mana 14", descricao: "Tem gosto de céu limpo." },
  lendario: { nome: "Coração de cristal", tipo: "rapido", efeito: "mana 24", descricao: "Um cristal que se desfaz na mão e enche o peito de força." },
};
/** Relíquias: não têm efeito, valem ouro na loja. */
const RELIQUIAS = {
  comum: { nome: "Bugiganga curiosa", valor: 12, descricao: "Não serve para nada, mas alguém paga por isso." },
  incomum: { nome: "Anel de prata gravado", valor: 30, descricao: "Trabalho fino de um ourives esquecido." },
  raro: { nome: "Estatueta de jade", valor: 70, descricao: "Pequena, pesada e muito antiga." },
  epico: { nome: "Gema do tamanho de um ovo", valor: 160, descricao: "Corta a luz em sete cores." },
  lendario: { nome: "Coroa de um rei esquecido", valor: 400, descricao: "Ninguém lembra o nome do rei; todos reconhecem o ouro." },
};
const OURO_DA_BOLSA = { comum: 15, incomum: 30, raro: 60, epico: 120, lendario: 280 };
const itemDe = (base, raridade, qtd = 1) => ({ nome: base.nome, qtd, tipo: base.tipo || "outro", efeito: base.efeito || "", descricao: base.descricao, raridade });

/**
 * As 3 opções de saque de um personagem: uma poção, uma bolsa de ouro e, para conjuradores, um tônico de mana
 * (para os outros, uma relíquia para vender). O jogador fica com uma.
 */
function gerarSaque(ficha, rng = Math.random) {
  const nivel = ficha?.nivel || 1;
  const r1 = sortearRaridade(nivel, rng), r2 = sortearRaridade(nivel, rng), r3 = sortearRaridade(nivel, rng);
  const terceira = R.ehConjurador(ficha?.classe)
    ? { tipo: "item", raridade: r3, item: itemDe(TONICOS[r3], r3) }
    : { tipo: "item", raridade: r3, item: itemDe({ ...RELIQUIAS[r3], descricao: `${RELIQUIAS[r3].descricao} Vale ${RELIQUIAS[r3].valor} de ouro na loja.` }, r3) };
  return [
    { tipo: "item", raridade: r1, item: itemDe(POCOES[r1], r1) },
    { tipo: "ouro", raridade: r2, ouro: OURO_DA_BOLSA[r2] },
    terceira,
  ];
}

/** Ouro que cada personagem de pé ganha numa vitória. */
function ouroDaVitoria(ficha, inimigos, rng = Math.random) {
  return 6 + 3 * (ficha?.nivel || 1) + 2 * Math.min(8, inimigos || 1) + Math.floor(rng() * 6);
}

// ── Loja da vila ──
const LOJA = [
  { id: "atadura", preco: 10, item: itemDe({ nome: "Ataduras limpas", tipo: "rapido", efeito: "cura 1d4+1", descricao: "Estancam o sangue na hora." }, "comum") },
  { id: "pocao", preco: 25, item: itemDe(POCOES.comum, "comum") },
  { id: "pocao-maior", preco: 60, item: itemDe(POCOES.incomum, "incomum") },
  { id: "pocao-superior", preco: 140, item: itemDe(POCOES.raro, "raro") },
  { id: "cha", preco: 15, item: itemDe(TONICOS.comum, "comum") },
  { id: "tonico", preco: 45, item: itemDe(TONICOS.incomum, "incomum") },
  { id: "essencia", preco: 110, item: itemDe(TONICOS.raro, "raro") },
];
/** Serviço: uma noite na estalagem recupera toda a vida e a mana de quem paga. */
const precoDaEstalagem = (ficha) => 15 + 5 * (ficha?.nivel || 1);
const NOMES_EN = {
  "Ataduras limpas": "Clean bandages", "Poção de cura": "Healing potion", "Poção de cura maior": "Greater healing potion",
  "Poção de cura superior": "Superior healing potion", "Elixir da vida": "Elixir of life", "Lágrima da fênix": "Phoenix tear",
  "Chá revigorante": "Invigorating tea", "Tônico de mana": "Mana tonic", "Essência arcana": "Arcane essence", "Néctar estelar": "Star nectar",
  "Coração de cristal": "Crystal heart", "Bugiganga curiosa": "Curious trinket", "Anel de prata gravado": "Engraved silver ring",
  "Estatueta de jade": "Jade statuette", "Gema do tamanho de um ovo": "Egg-sized gem", "Coroa de um rei esquecido": "Crown of a forgotten king",
};
/** Nome para mostrar (o nome guardado na ficha continua em português: é ele que o jogo usa). */
const nomeNoIdioma = (nome, idioma) => (idioma === "en" && NOMES_EN[nome]) || nome;

const PRECO_POCAO = { comum: 25, incomum: 60, raro: 140, epico: 300, lendario: 700 };
const PRECO_TONICO = { comum: 15, incomum: 45, raro: 110, epico: 240, lendario: 550 };
/** Quanto a loja paga por um item da ficha: relíquias pelo valor cheio, poções e tônicos por 40% do preço. 0 = não compra. */
function valorDeVenda(item) {
  const k = R.chave(item?.nome || "");
  const igual = (b) => R.chave(b.nome) === k;
  const rel = Object.values(RELIQUIAS).find(igual);
  if (rel) return rel.valor;
  for (const r of RARIDADES) {
    if (igual(POCOES[r])) return Math.floor(PRECO_POCAO[r] * 0.4);
    if (igual(TONICOS[r])) return Math.floor(PRECO_TONICO[r] * 0.4);
  }
  const l = LOJA.find((x) => igual(x.item));
  return l ? Math.max(1, Math.floor(l.preco * 0.4)) : 0;
}

/** Põe o item na ficha (soma se já tiver). false se o inventário está cheio. */
function guardarItem(f, item, qtd = 1) {
  const existente = R.itemDaFicha(f, item.nome);
  if (existente) { existente.qtd = Math.min(R.MAX_QTD, existente.qtd + qtd); if (item.raridade && !existente.raridade) existente.raridade = item.raridade; }
  else if (f.inventario.length < R.MAX_ITENS) f.inventario.push({ ...item, qtd });
  else return false;
  f.equipamento = R.equipamentoDerivado(f.inventario);
  return true;
}

// ── Descanso curto ──
/** Uma vez por ato: recupera metade da vida e metade da mana máximas (arredondado para cima). */
function descansoCurto(f) {
  const pv = Math.min(f.pvMax - f.pv, Math.ceil(f.pvMax / 2));
  const mana = Math.min(f.manaMax - f.mana, Math.ceil(f.manaMax / 2));
  return { pv: Math.max(0, pv), mana: Math.max(0, mana) };
}

// ── Bestiário ──
/** "Goblin 2" e "Goblin 1" são a mesma criatura. */
const especie = (nome) => String(nome || "Inimigo").replace(/\s+\d+$/, "").trim() || "Inimigo";
function anotarEncontro(best, inimigos, dia) {
  const b = best && typeof best === "object" && !Array.isArray(best) ? best : {};
  for (const i of inimigos || []) {
    const nome = especie(i.nome), k = R.chave(nome);
    if (!k) continue;
    if (!b[k] && Object.keys(b).length >= 80) continue;
    const e = (b[k] ||= { nome, vistos: 0, derrotados: 0, pvMax: 0, ca: 0, dia: dia || 1 });
    e.vistos++;
    e.pvMax = Math.max(e.pvMax, Number(i.pvMax || i.pv) || 0);
    e.ca = Math.max(e.ca, Number(i.ca) || 0);
  }
  return b;
}
function anotarDerrotas(best, inimigos) {
  const b = best && typeof best === "object" && !Array.isArray(best) ? best : {};
  for (const i of inimigos || []) {
    if (Number(i.pv) > 0) continue;
    const e = b[R.chave(especie(i.nome))];
    if (e) e.derrotados = Math.min(e.vistos, e.derrotados + 1);
  }
  return b;
}
/** Lista para o app: vida e armadura só aparecem depois de derrotar a criatura ao menos uma vez. */
function bestiarioPublico(best) {
  const b = best && typeof best === "object" && !Array.isArray(best) ? best : {};
  return Object.values(b).map((e) => ({ nome: e.nome, vistos: e.vistos, derrotados: e.derrotados, dia: e.dia,
    ...(e.derrotados > 0 ? { pvMax: e.pvMax, ca: e.ca } : {}) })).sort((x, y) => x.dia - y.dia || x.nome.localeCompare(y.nome));
}

// ── Crônica: os marcos da campanha, tirados do diário ──
const MARCO = /^(A sessão começou\.|Ato \d — |Fim da aventura|Combate encerrado\. Vitória|O grupo caiu|Dia \d+ começa|.+ subiu para o nível \d+|O grupo voltou ao ponto de salvamento|Epílogo)/;
const ehMarco = (e) => e.tipo === "sys" && MARCO.test(e.texto || "");
const tipoDoMarco = (t) => /^Ato \d|^A sessão|^Fim da aventura|^Epílogo/.test(t) ? "historia" : /^Combate|^O grupo caiu/.test(t) ? "combate"
  : /subiu para o nível/.test(t) ? "nivel" : /^Dia \d/.test(t) ? "dia" : "salvamento";

// ── Epílogo ──
function promptEpilogo({ tema, arco, resumo, fichas, ultimas, bloco }) {
  return `Você é o Mestre de um RPG de mesa. A aventura terminou e você vai contar o EPÍLOGO: o que aconteceu com o mundo e com cada personagem depois do fim.

TEMA: ${tema.nome}. ${tema.ambientacao}
AVENTURA: ${arco?.titulo || "sem título"}${arco?.premissa ? ` — ${arco.premissa}` : ""}
RESUMO DO QUE ACONTECEU: ${resumo || "(sem resumo)"}
ÚLTIMAS CENAS:
${ultimas || "(nenhuma)"}
PERSONAGENS:
${fichas.map((f) => `* ${f.nome} (nível ${f.nivel})${f.antecedente ? `, ${f.antecedente}` : ""}${f.tracos?.vinculo ? `; vínculo: ${f.tracos.vinculo}` : ""}${f.tracos?.ideal ? `; ideal: ${f.tracos.ideal}` : ""}`).join("\n")}

COMO ESCREVER:
- "geral": 2 a 4 frases sobre o destino do lugar e das pessoas que o grupo conheceu, coerente com o que aconteceu de fato.
- "personagens": para CADA personagem acima, uma ou duas frases sobre a vida dele depois, ligadas ao que ele fez e ao seu vínculo ou ideal. Use exatamente o nome dado.
- Tom de fim de história lido em voz alta. Nada de regras, números ou convite para continuar.
- Escreva em português do Brasil.

Responda SOMENTE com JSON neste formato:
{"geral": "...", "personagens": [{"nome": "...", "destino": "..."}]}${bloco || ""}`;
}
/** Epílogo guardado: sempre com um texto geral e uma entrada por personagem (mesmo que a IA esqueça alguém). */
function normalizarEpilogo(r, fichas, texto) {
  const lista = Array.isArray(r?.personagens) ? r.personagens : [];
  const geral = texto(r?.geral || r?.narracao, 900) || "A história chegou ao fim, e o que o grupo fez ainda será contado por muito tempo.";
  const personagens = fichas.map((f) => {
    const achado = lista.find((p) => p && R.chave(p.nome) === R.chave(f.nome));
    return { nome: f.nome, destino: texto(achado?.destino, 400) || `${f.nome} seguiu seu caminho, levando as marcas e as histórias desta aventura.` };
  });
  return { geral, personagens };
}

// ── Pontos de salvamento ──
const COLUNAS_DO_PONTO = ["fase", "cena", "resumo", "fundo", "combate", "arco", "arcoAjustes", "ato", "arcoConcluido", "atoInicio", "dia", "diaNarr",
  "elementos", "ultimaNarrativa", "saque", "bestiario", "epilogo"];
const MAX_PONTOS = 5;

/**
 * Liga as rotas ao servidor. `d` traz o que o server.js já tem (banco, helpers, módulos).
 * Devolve os ganchos { aoEncontrar, aoVencer, pedirPonto, fecharPonto, mesaPublica, aoReiniciar }.
 */
function instalar(d) {
  const { app, db, authMw, limiteIA, mesaDoMembro, carregar, salvarMesa, salvarFicha, registrar, broadcast, erro, json, texto, agora, travar, destravar, M, T, TRAVA_MS, msgErro, chaveIA } = d;
  const idiomaDe = (req) => M.idiomaValido(req.get("x-idioma"));

  db.exec("CREATE TABLE IF NOT EXISTS salvamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL, criadoEm INTEGER NOT NULL, rotulo TEXT NOT NULL, logId INTEGER NOT NULL, dados TEXT NOT NULL)");

  /** O Mestre está no meio de uma narração: quem grava a ficha agora pode ser sobrescrito por ele. */
  const ocupada = (mesa) => !!(mesa.processando && agora() - mesa.processando.desde < TRAVA_MS);

  /** Carrega mesa e ficha para uma ação rápida fora de combate; responde o erro e devolve null se não der. */
  function preparar(req, res, { vivo = true } = {}) {
    const codigo = mesaDoMembro(req, res); if (!codigo) return null;
    const ctx = carregar(codigo, req.uid);
    const f = ctx.fichas[req.uid];
    if (!f) { erro(res, 400, "Crie seu personagem."); return null; }
    if (ctx.mesa.fase !== "jogo") { erro(res, 409, "A aventura ainda não começou."); return null; }
    if (ctx.mesa.combate) { erro(res, 409, "Em combate não dá: termine a luta primeiro."); return null; }
    if (ctx.mesa.rolagem) { erro(res, 409, "Há uma rolagem pendente."); return null; }
    if (ocupada(ctx.mesa)) { erro(res, 409, "Espere o Mestre terminar de narrar."); return null; }
    if (vivo && f.pv <= 0) { erro(res, 409, `${f.nome} está caído.`); return null; }
    return { codigo, ctx, f };
  }
  const saqueDaMesa = (mesa) => { const s = json(mesa.saque); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; };

  // ── Ganchos ──
  function aoEncontrar(codigo, inimigos) {
    const m = db.prepare("SELECT bestiario, dia FROM mesas WHERE codigo = ?").get(codigo);
    if (m) salvarMesa(codigo, { bestiario: anotarEncontro(json(m.bestiario), inimigos, Math.max(1, Number(m.dia) || 1)) });
  }
  /** Vitória: cada personagem de pé ganha ouro e 3 opções de saque para escolher uma. */
  function aoVencer(ctx, vivos, inimigos) {
    const m = db.prepare("SELECT bestiario, saque FROM mesas WHERE codigo = ?").get(ctx.codigo);
    const saque = saqueDaMesa(m || {});
    const partes = [];
    for (const f of vivos) {
      const ouro = ouroDaVitoria(f, (inimigos || []).length);
      f.ouro = Math.min(99999, (f.ouro || 0) + ouro);
      salvarFicha(ctx.codigo, f);
      saque[f.uid] = gerarSaque(f);
      partes.push(`${f.nome} +${ouro}`);
    }
    salvarMesa(ctx.codigo, { saque, bestiario: anotarDerrotas(json(m?.bestiario), inimigos) });
    if (partes.length) registrar(ctx.codigo, { tipo: "sys", texto: `Ouro encontrado: ${partes.join(", ")}. Cada um escolhe um item do saque.`, ok: true });
  }
  /** Guarda o estado da mesa e das fichas (os 5 mais recentes ficam). */
  function pontoDeSalvamento(codigo, rotulo) {
    const m = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    if (!m) return null;
    const mesa = Object.fromEntries(COLUNAS_DO_PONTO.map((k) => [k, m[k] ?? null]));
    const fichas = Object.fromEntries(db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo).map((r) => [r.uid, r.dados]));
    const logId = db.prepare("SELECT COALESCE(MAX(id), 0) m FROM log WHERE codigo = ?").get(codigo).m;
    const info = db.prepare("INSERT INTO salvamentos (codigo, criadoEm, rotulo, logId, dados) VALUES (?, ?, ?, ?, ?)")
      .run(codigo, agora(), texto(rotulo, 80) || "Ponto de salvamento", logId, JSON.stringify({ mesa, fichas }));
    db.prepare("DELETE FROM salvamentos WHERE codigo = ? AND id NOT IN (SELECT id FROM salvamentos WHERE codigo = ? ORDER BY id DESC LIMIT ?)").run(codigo, codigo, MAX_PONTOS);
    return Number(info.lastInsertRowid);
  }
  // O ato muda no meio de uma resposta do Mestre: o ponto é pedido ali e gravado quando a resposta termina de ser aplicada.
  const pendentes = new Map();
  const pedirPonto = (codigo, rotulo) => pendentes.set(codigo, rotulo);
  function fecharPonto(codigo) {
    const rotulo = pendentes.get(codigo);
    if (!rotulo) return;
    pendentes.delete(codigo);
    try { pontoDeSalvamento(codigo, rotulo); } catch (e) { console.error("[salvamento]", e.message); }
  }
  const listarPontos = (codigo) => db.prepare("SELECT id, criadoEm, rotulo FROM salvamentos WHERE codigo = ? ORDER BY id DESC").all(codigo);
  /** Ajusta a mesa que vai para o app: só o saque de quem pediu; o bestiário vai pela crônica. */
  function mesaPublica(mesa, uid, idioma) {
    const meu = saqueDaMesa(mesa)[uid];
    // "nome" é só para mostrar, no idioma do aparelho; o item guardado continua com o nome em português
    mesa.saque = Array.isArray(meu) && meu.length ? meu.map((o) => (o.item ? { ...o, nome: nomeNoIdioma(o.item.nome, idioma) } : o)) : null;
    mesa.epilogo = json(mesa.epilogo) || null;
    delete mesa.bestiario;
  }
  function aoReiniciar(codigo) {
    salvarMesa(codigo, { saque: null, bestiario: null, epilogo: null });
    db.prepare("DELETE FROM salvamentos WHERE codigo = ?").run(codigo);
    for (const r of db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo)) {
      const f = R.normalizarFicha(json(r.dados), r.uid);
      f.descanso = 0;
      salvarFicha(codigo, f);
    }
  }

  // ── Saque ──
  app.post("/api/saque", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const ctx = carregar(codigo, req.uid);
    const f = ctx.fichas[req.uid];
    if (!f) return erro(res, 400, "Crie seu personagem.");
    if (ocupada(ctx.mesa)) return erro(res, 409, "Espere o Mestre terminar de narrar.");
    const saque = saqueDaMesa(ctx.mesa);
    const opcoes = saque[req.uid];
    const i = Number(req.body?.indice);
    if (!Array.isArray(opcoes) || !opcoes.length) return erro(res, 409, "Não há saque para escolher.");
    if (!Number.isInteger(i) || i < 0 || i >= opcoes.length) return erro(res, 400, "Escolha uma das opções.");
    const op = opcoes[i];
    let ganho;
    if (op.tipo === "ouro") {
      f.ouro = Math.min(99999, (f.ouro || 0) + op.ouro);
      ganho = `${op.ouro} de ouro`;
    } else {
      if (!guardarItem(f, op.item, op.item.qtd || 1)) return erro(res, 409, "Seu inventário está cheio. Escolha o ouro ou libere espaço.");
      ganho = `${op.item.nome} (${NOME_RARIDADE[op.raridade] || "Comum"})`;
    }
    delete saque[req.uid];
    salvarFicha(codigo, f);
    salvarMesa(codigo, { saque });
    registrar(codigo, { tipo: "sys", texto: `${f.nome} ficou com ${ganho}.`, ok: true });
    broadcast(codigo, "ficha", { uid: f.uid });
    res.json({ ok: true, ouro: f.ouro });
  });

  // ── Loja da vila ──
  app.get("/api/mesa/:codigo/loja", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const ctx = carregar(codigo, req.uid);
    const f = ctx.fichas[req.uid];
    const idioma = idiomaDe(req);
    res.json({
      ouro: f?.ouro || 0,
      aberta: !!f && ctx.mesa.fase === "jogo" && !ctx.mesa.combate,
      itens: LOJA.map((l) => ({ id: l.id, preco: l.preco, nome: nomeNoIdioma(l.item.nome, idioma), tipo: l.item.tipo, efeito: l.item.efeito, raridade: l.item.raridade })),
      estalagem: { preco: precoDaEstalagem(f) },
      vender: (f?.inventario || []).map((it) => ({ item: it.nome, nome: nomeNoIdioma(it.nome, idioma), qtd: it.qtd, valor: valorDeVenda(it), raridade: it.raridade || "comum" })).filter((v) => v.valor > 0),
    });
  });
  app.post("/api/loja/comprar", authMw, (req, res) => {
    const p = preparar(req, res); if (!p) return;
    const { codigo, f } = p;
    const id = String(req.body?.id || "");
    if (id === "estalagem") {
      const preco = precoDaEstalagem(f);
      if (f.pv >= f.pvMax && f.mana >= f.manaMax) return erro(res, 409, "Você já está descansado.");
      if ((f.ouro || 0) < preco) return erro(res, 409, `Falta ouro: a estalagem custa ${preco}.`);
      f.ouro -= preco; f.pv = f.pvMax; f.mana = f.manaMax;
      salvarFicha(codigo, f);
      registrar(codigo, { tipo: "sys", texto: `${f.nome} passa a noite na estalagem e acorda inteiro (−${preco} de ouro).`, ok: true });
    } else {
      const l = LOJA.find((x) => x.id === id);
      if (!l) return erro(res, 400, "A loja não tem isso.");
      if ((f.ouro || 0) < l.preco) return erro(res, 409, `Falta ouro: ${l.item.nome} custa ${l.preco}.`);
      if (!guardarItem(f, l.item, 1)) return erro(res, 409, "Seu inventário está cheio.");
      f.ouro -= l.preco;
      salvarFicha(codigo, f);
      registrar(codigo, { tipo: "sys", texto: `${f.nome} comprou ${l.item.nome} (−${l.preco} de ouro).` });
    }
    broadcast(codigo, "ficha", { uid: f.uid });
    res.json({ ok: true, ouro: f.ouro });
  });
  app.post("/api/loja/vender", authMw, (req, res) => {
    const p = preparar(req, res); if (!p) return;
    const { codigo, f } = p;
    const it = R.itemDaFicha(f, texto(req.body?.item, 40));
    if (!it) return erro(res, 409, "Você não tem esse item.");
    const valor = valorDeVenda(it);
    if (!valor) return erro(res, 409, `A loja não compra ${it.nome}.`);
    const nome = it.nome;
    it.qtd -= 1;
    if (it.qtd <= 0) f.inventario = f.inventario.filter((x) => x !== it);
    f.equipamento = R.equipamentoDerivado(f.inventario);
    f.ouro = Math.min(99999, (f.ouro || 0) + valor);
    salvarFicha(codigo, f);
    registrar(codigo, { tipo: "sys", texto: `${f.nome} vendeu ${nome} (+${valor} de ouro).` });
    broadcast(codigo, "ficha", { uid: f.uid });
    res.json({ ok: true, ouro: f.ouro });
  });

  // ── Descanso curto (uma vez por ato) ──
  app.post("/api/descanso-curto", authMw, (req, res) => {
    const p = preparar(req, res); if (!p) return;
    const { codigo, ctx, f } = p;
    const ato = Math.min(3, Math.max(1, Number(ctx.mesa.ato) || 1));
    if (f.descanso === ato) return erro(res, 409, "Você já fez o descanso curto deste ato.");
    const ganho = descansoCurto(f);
    if (!ganho.pv && !ganho.mana) return erro(res, 409, "Você já está descansado.");
    f.pv += ganho.pv; f.mana += ganho.mana; f.descanso = ato;
    salvarFicha(codigo, f);
    const partes = [ganho.pv ? `${ganho.pv} PV` : "", ganho.mana ? `${ganho.mana} de ${T.atributoMagiaDoTema(ctx.mesa.tema).toLowerCase()}` : ""].filter(Boolean).join(" e ");
    registrar(codigo, { tipo: "roll", texto: `${f.nome} faz um descanso curto: recupera ${partes}`, ok: true });
    broadcast(codigo, "ficha", { uid: f.uid });
    res.json({ ok: true, ...ganho });
  });

  // ── Crônica: marcos do diário, bestiário, pontos de salvamento e epílogo ──
  app.get("/api/mesa/:codigo/cronica", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const m = db.prepare("SELECT dono, resumo, bestiario, epilogo, arcoConcluido, ato FROM mesas WHERE codigo = ?").get(codigo);
    const marcos = db.prepare("SELECT id, t, texto FROM log WHERE codigo = ? AND tipo = 'sys' ORDER BY id").all(codigo)
      .filter((e) => MARCO.test(e.texto || "")).slice(-200).map((e) => ({ id: e.id, t: e.t, tipo: tipoDoMarco(e.texto), texto: e.texto }));
    res.json({
      resumo: m.resumo || "",
      marcos,
      bestiario: bestiarioPublico(json(m.bestiario)),
      salvamentos: listarPontos(codigo),
      podeRestaurar: m.dono === req.uid,
      concluida: !!Number(m.arcoConcluido),
      epilogo: json(m.epilogo) || null,
    });
  });

  // ── Pontos de salvamento ──
  app.post("/api/salvamento/criar", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const m = db.prepare("SELECT dono, fase, combate, rolagem, processando, dia, cena FROM mesas WHERE codigo = ?").get(codigo);
    if (m.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa pode salvar.");
    if (m.fase !== "jogo") return erro(res, 409, "A aventura ainda não começou.");
    if (json(m.combate) || json(m.rolagem)) return erro(res, 409, "Em combate ou com rolagem pendente não dá para salvar.");
    if (ocupada({ processando: json(m.processando) })) return erro(res, 409, "Espere o Mestre terminar de narrar.");
    const id = pontoDeSalvamento(codigo, `Dia ${Math.max(1, Number(m.dia) || 1)} — ${m.cena || "salvo pelo grupo"}`);
    res.json({ ok: true, id, salvamentos: listarPontos(codigo) });
  });
  app.post("/api/salvamento/restaurar", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const m = db.prepare("SELECT dono, processando FROM mesas WHERE codigo = ?").get(codigo);
    if (m.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa pode voltar a um ponto de salvamento.");
    if (ocupada({ processando: json(m.processando) })) return erro(res, 409, "Espere o Mestre terminar de narrar.");
    const p = db.prepare("SELECT * FROM salvamentos WHERE codigo = ? AND id = ?").get(codigo, Number(req.body?.id) || 0);
    const dados = json(p?.dados);
    if (!p || !dados?.mesa) return erro(res, 404, "Ponto de salvamento não encontrado.");
    db.transaction(() => {
      db.prepare("DELETE FROM log WHERE codigo = ? AND id > ?").run(codigo, p.logId);
      db.prepare("DELETE FROM reacoes WHERE codigo = ? AND logId > ?").run(codigo, p.logId);
      salvarMesa(codigo, { ...Object.fromEntries(COLUNAS_DO_PONTO.map((k) => [k, dados.mesa[k] ?? null])), rolagem: null, processando: null });
      // quem entrou na mesa depois do ponto continua com a ficha que tem
      for (const [uid, f] of Object.entries(dados.fichas || {})) db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(f, codigo, uid);
      db.prepare("DELETE FROM salvamentos WHERE codigo = ? AND id > ?").run(codigo, p.id);
    })();
    registrar(codigo, { tipo: "sys", texto: `O grupo voltou ao ponto de salvamento: ${p.rotulo}.` });
    broadcast(codigo, "reinicio", {});
    res.json({ ok: true });
  });

  // ── Epílogo: depois do fim da aventura, o Mestre conta o destino de cada personagem ──
  app.post("/api/epilogo", authMw, limiteIA, async (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const ctx = carregar(codigo, req.uid);
    if (!Number(ctx.mesa.arcoConcluido)) return erro(res, 409, "O epílogo vem depois do fim da aventura.");
    const pronto = json(ctx.mesa.epilogo);
    if (pronto) return res.json({ ok: true, epilogo: pronto });
    if (ctx.mesa.combate) return erro(res, 409, "Em combate não dá: termine a luta primeiro.");
    const fichas = Object.values(ctx.fichas);
    if (!fichas.length) return erro(res, 409, "Não há personagens nesta mesa.");
    const msg = travar(codigo, req.uid, ctx.mesa.membros[req.uid] || "");
    if (msg) return erro(res, 409, msg);
    try {
      const ultimas = db.prepare("SELECT texto FROM log WHERE codigo = ? AND tipo = 'narr' ORDER BY id DESC LIMIT 4").all(codigo).reverse().map((e) => `- ${e.texto}`).join("\n");
      const prompt = promptEpilogo({ tema: T.temaPorId(ctx.mesa.tema), arco: ctx.mesa.arco, resumo: ctx.mesa.resumo, fichas, ultimas, bloco: M.blocoIdioma(ctx.mesa.idioma) });
      let r = null;
      try { r = await M.perguntar(chaveIA(), prompt, ctx.mesa.qualidade || "rapido", 2500, 0.8); } catch (e) { console.log(`[epilogo] ${e.message}`); }
      const epilogo = normalizarEpilogo(r, fichas, texto);
      salvarMesa(codigo, { epilogo });
      registrar(codigo, { tipo: "sys", texto: "Epílogo: o Mestre conta o destino de cada um." }, { tipo: "narr", texto: epilogo.geral });
      res.json({ ok: true, epilogo });
    } catch (e) { console.error("[epilogo]", e); erro(res, 502, msgErro(e)); }
    finally { destravar(codigo); }
  });

  return { aoEncontrar, aoVencer, pontoDeSalvamento, pedirPonto, fecharPonto, mesaPublica, aoReiniciar };
}

module.exports = {
  RARIDADES, NOME_RARIDADE, POCOES, TONICOS, RELIQUIAS, LOJA, chancesDeRaridade, sortearRaridade, gerarSaque, ouroDaVitoria,
  precoDaEstalagem, valorDeVenda, guardarItem, descansoCurto, especie, anotarEncontro, anotarDerrotas, bestiarioPublico,
  ehMarco, tipoDoMarco, promptEpilogo, normalizarEpilogo, nomeNoIdioma, instalar,
};
