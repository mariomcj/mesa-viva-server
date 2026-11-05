/**
 * Testes dos nomes do tema (raças, classes, magias e técnicas com o nome de cada tema; só a exibição muda):
 * dados completos dos 20 temas, funções de tradução, estado da mesa, textos do diário e da rolagem,
 * mensagens 409, evolução, contexto do Mestre e criação (servidor de verdade, banco temporário, Mestre falso).
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-nomes-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
delete process.env.ADMIN_PASS;
const { registro } = require("./mestre-falso");
const { server, db } = require("../server");
const T = require("../temas");
const R = require("../regras");
const C = require("../catalogo");
const M = require("../mestre");

/** A regex com que o app lê os números da linha da própria rolagem (não pode deixar de funcionar). */
const REGEX_APP = /:\s*(\d+)\s*(?:[+\-]\s*\d+)?\s*=\s*(-?\d+)/;
const MAGIAS = C.MAGIAS.map((m) => m.nome), TECNICAS = C.TECNICAS.map((t) => t.nome);
const sem = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ── Dados ──

test("nomes: cobertura completa em todos os 20 temas (todas as raças, classes, 33 magias e 13 técnicas)", () => {
  assert.equal(T.TEMAS.length, 20);
  assert.equal(MAGIAS.length, 33);
  assert.equal(TECNICAS.length, 13);
  for (const t of T.TEMAS) {
    const n = t.nomes;
    assert.ok(n, `${t.id}: sem nomes`);
    assert.deepEqual(Object.keys(n).sort(), ["atributoMagia", "classes", "magias", "racas", "tecnicas"], t.id);
    assert.deepEqual(Object.keys(n.racas).sort(), [...R.RACAS].sort(), `${t.id}: raças`);
    assert.deepEqual(Object.keys(n.classes).sort(), [...R.CLASSES].sort(), `${t.id}: classes`);
    assert.deepEqual(Object.keys(n.magias).sort(), [...MAGIAS].sort(), `${t.id}: magias`);
    assert.deepEqual(Object.keys(n.tecnicas).sort(), [...TECNICAS].sort(), `${t.id}: técnicas`);
    for (const cat of ["racas", "classes"]) {
      for (const [mec, v] of Object.entries(n[cat])) {
        assert.deepEqual(Object.keys(v).sort(), ["descricao", "nome"], `${t.id}.${cat}.${mec}`);
        assert.ok(typeof v.nome === "string" && v.nome.trim() === v.nome && v.nome.length >= 2 && v.nome.length <= 22, `${t.id}.${mec}: nome "${v.nome}"`);
        assert.ok(typeof v.descricao === "string" && v.descricao.length <= 90, `${t.id}.${mec}: descrição com ${v.descricao.length} caracteres`);
        assert.match(v.descricao, /^\S.* \([^()]+\)$/, `${t.id}.${mec}: descrição sem a mecânica entre parênteses no fim`);
      }
    }
    for (const cat of ["magias", "tecnicas"]) {
      for (const [mec, nome] of Object.entries(n[cat])) {
        // até 22 caracteres (o clássico repete o nome mecânico, mesmo um longo como "Curar Ferimentos Graves")
        assert.ok(typeof nome === "string" && nome.trim() === nome && nome.length >= 2 && (nome.length <= 22 || nome === mec), `${t.id}.${cat}.${mec}: "${nome}"`);
      }
    }
    assert.ok(typeof n.atributoMagia === "string" && n.atributoMagia.length >= 2 && n.atributoMagia.length <= 16, `${t.id}: atributoMagia`);
    assert.ok(!/s$/.test(n.atributoMagia), `${t.id}: "${n.atributoMagia}" no plural não concorda com "insuficiente"`);
  }
});

test("nomes: a descrição diz a mecânica (classe que conjura e por qual atributo)", () => {
  for (const t of T.TEMAS) {
    if (t.id === "classico") continue;
    for (const [mec, v] of Object.entries(t.nomes.racas)) assert.ok(v.descricao.endsWith(`(como ${mec})`), `${t.id}.${mec}: ${v.descricao}`);
    assert.ok(t.nomes.classes.Mago.descricao.endsWith("(conjura como Mago, por Inteligência)"), t.id);
    assert.ok(t.nomes.classes["Clérigo"].descricao.endsWith("(conjura como Clérigo, por Sabedoria)"), t.id);
    assert.ok(t.nomes.classes.Ladino.descricao.endsWith("(age como Ladino, por Destreza)"), t.id);
    assert.ok(t.nomes.classes.Guerreiro.descricao.endsWith("(luta como Guerreiro)"), t.id);
  }
  // o exemplo do contrato
  assert.deepEqual(T.nomesDoTema("cyberpunk").classes.Mago, { nome: "Hacker", descricao: "Hacker de interface neural (conjura como Mago, por Inteligência)" });
});

test("nomes: sem repetição no mesmo tema (nem entre categorias) e sem esconder outro nome mecânico", () => {
  const mecanicos = new Map([...R.RACAS, ...R.CLASSES, ...MAGIAS, ...TECNICAS].map((x) => [sem(x), x]));
  for (const t of T.TEMAS) {
    const todos = new Map();
    for (const cat of ["racas", "classes", "magias", "tecnicas"]) {
      const daCategoria = new Set();
      for (const [mec, v] of Object.entries(t.nomes[cat])) {
        const nome = typeof v === "string" ? v : v.nome;
        const k = sem(nome);
        assert.ok(!daCategoria.has(k), `${t.id}.${cat}: "${nome}" repetido`);
        daCategoria.add(k);
        assert.ok(!todos.has(k), `${t.id}: "${nome}" (${mec}) repete ${todos.get(k)}`);
        todos.set(k, mec);
        // um nome do tema igual a OUTRO nome mecânico confundiria as rotas ("Relâmpago" para a Bola de Fogo, por exemplo)
        if (mecanicos.has(k)) assert.equal(mecanicos.get(k), mec, `${t.id}: "${nome}" é o nome mecânico de ${mecanicos.get(k)}`);
      }
    }
  }
});

test("nomes: clássico usa os nomes de D&D; os outros temas trocam todos", () => {
  const c = T.nomesDoTema("classico");
  for (const cat of ["racas", "classes"]) for (const [mec, v] of Object.entries(c[cat])) assert.equal(v.nome, mec);
  for (const cat of ["magias", "tecnicas"]) for (const [mec, v] of Object.entries(c[cat])) assert.equal(v, mec);
  assert.equal(c.atributoMagia, "Mana");
  for (const t of T.TEMAS) {
    if (t.id === "classico") continue;
    for (const cat of ["racas", "classes"]) for (const [mec, v] of Object.entries(t.nomes[cat])) assert.notEqual(sem(v.nome), sem(mec), `${t.id}.${mec}`);
    for (const cat of ["magias", "tecnicas"]) for (const [mec, v] of Object.entries(t.nomes[cat])) assert.notEqual(sem(v), sem(mec), `${t.id}.${mec}`);
  }
});

test("nomes: coerentes com o texto `fichas` de cada tema (as magias que ele cita e as raças e classes)", () => {
  const palavras = (s) => new Set(sem(s).split(/[^a-z]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
  const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let conferidas = 0;
  for (const t of T.TEMAS) {
    if (t.id === "classico") continue;
    // "(Bola de Fogo = granada incendiária; Sono = pulso neural)": o nome do tema repete uma palavra do exemplo
    for (const m of MAGIAS) {
      const x = t.fichas.match(new RegExp(`${escapar(m)} = ([^;)]+)`));
      if (!x) continue;
      conferidas++;
      const doTema = palavras(t.nomes.magias[m]);
      assert.ok([...palavras(x[1])].some((w) => doTema.has(w)), `${t.id}: ${m} = "${x[1]}" no fichas, mas "${t.nomes.magias[m]}" nos nomes`);
    }
    // "Elfo = modelo genético de luxo, belo e rápido": a descrição parte do mesmo texto
    for (const cat of ["racas", "classes"]) {
      for (const [mec, v] of Object.entries(t.nomes[cat])) {
        const x = t.fichas.match(new RegExp(`${escapar(mec)} = ([^;.]+)`));
        assert.ok(x, `${t.id}: fichas sem "${mec} = …"`);
        const desc = palavras(v.descricao.replace(/\([^)]*\)$/, ""));
        assert.ok([...palavras(x[1])].some((w) => desc.has(w)), `${t.id}.${mec}: "${v.descricao}" não combina com "${x[1]}"`);
      }
    }
  }
  assert.ok(conferidas >= 80, `só ${conferidas} exemplos de magia conferidos`);
});

test("nomes: propriedade intelectual — nenhum termo de obra protegida", () => {
  const proibidos = ["Hogwarts", "Grifin", "Sonserin", "Corvinal", "Lufa-Lufa", "Quadribol", "trouxa", "Dumbledore", "Voldemort", "Horcrux", "Expelliarmus",
    "Patrono", "Lumos", "Accio", "Avada", "Expecto", "Alohomora", "Wingardium", "Estupefaça", "Pomo",
    "Gandalf", "Frodo", "Sauron", "Mordor", "Hobbit", "Condado", "Valfenda", "Nazg", "mithril", "Mithril", "Lembas", "Gondor", "Rohan", "Ent ",
    "Westeros", "Lannister", "Stark", "Targaryen", "Meistre", "Patrulha da Noite", "Fogovivo", "Fogo-vivo", "Septo",
    "Jedi", "Sith", "sabre de luz", "Sabre de Luz", "droide", "Droide", "Wookiee", "blaster", "Blaster", "Vibro", "Força",
    "Sparrow", "Pérola Negra", "Davy Jones", "Tortuga", "Night City", "netrunner", "Netrunner", "replicante", "Arasaka",
    "Vault", "Pip-Boy", "Nuka", "Stimpak", "RadAway", "Irmandade do Aço", "Immortan", "Deadlands", "Rick Grimes", "Negan", "Poirot", "Marple",
    "Gotham", "Metrópolis", "Vingadores", "X-Men", "Batman", "Superman", "Homem-Aranha", "Kryptonita", "Vibranium", "Adamantium", "Teia",
    "Kamehameha", "Rasengan", "Hadouken", "Chakra", "Phaser", "Taser", "Beholder", "Forgotten Realms"];
  for (const t of T.TEMAS) {
    const n = t.nomes;
    const tudo = [...Object.values(n.racas).flatMap((v) => [v.nome, v.descricao]), ...Object.values(n.classes).flatMap((v) => [v.nome, v.descricao]),
      ...Object.values(n.magias), ...Object.values(n.tecnicas), n.atributoMagia].join(" \n ");
    for (const p of proibidos) assert.ok(!tudo.includes(p), `${t.id} usa "${p}"`);
  }
});

test("nomes: a linha da rolagem com o nome do tema continua no formato que o app lê, em todos os temas", () => {
  for (const t of T.TEMAS) {
    for (const nome of [...Object.values(t.nomes.magias), ...Object.values(t.nomes.tecnicas)]) {
      assert.ok(!/[:=·]/.test(nome), `${t.id}: "${nome}" tem ":", "=" ou "·"`);
      for (const linha of [`Mário · ${nome} vs Goblin 1: 12+5 = 17 vs CA 13`, `Mário · ${nome} vs Goblin 1 (cobertura +2): 3-1 = 2 vs CA 15 (dado real)`]) {
        assert.ok(linha.startsWith("Mário · "));
        const m = linha.match(REGEX_APP);
        assert.ok(m, linha);
        assert.deepEqual([m[1], m[2]], linha.includes("12+5") ? ["12", "17"] : ["3", "2"], linha);
      }
    }
  }
});

test("nomes: tradução nos dois sentidos, sem diferenciar acentos e maiúsculas; outro texto e tema desconhecido", () => {
  assert.equal(T.nomeNoTema("cyberpunk", "Bola de Fogo"), "Granada Incendiária");
  assert.equal(T.nomeNoTema("cyberpunk", "bola de fogo"), "Granada Incendiária");
  assert.equal(T.nomeNoTema("cyberpunk", "Golpe poderoso"), "Soco Hidráulico");
  assert.equal(T.nomeNoTema("cyberpunk", "Elfo"), "Modelo de Luxo");
  assert.equal(T.nomeNoTema("cyberpunk", "Pistola inteligente"), "Pistola inteligente", "arma da ficha não muda");
  assert.equal(T.nomeMecanico("cyberpunk", "granada incendiaria"), "Bola de Fogo");
  assert.equal(T.nomeMecanico("cyberpunk", "Bola de Fogo"), "Bola de Fogo");
  assert.equal(T.nomeMecanico("cyberpunk", "Hacker"), "Mago");
  assert.equal(T.nomeMecanico("cyberpunk", "Bazuca"), "Bazuca");
  for (const tema of [undefined, null, "", "nao-existe"]) {
    assert.equal(T.nomesDoTema(tema), T.nomesDoTema("classico"));
    assert.equal(T.nomeNoTema(tema, "Bola de Fogo"), "Bola de Fogo");
  }
  assert.equal(T.atributoMagiaDoTema("cyberpunk"), "Bateria");
  assert.equal(T.nomesParaMestre("classico"), "");
  assert.equal(T.nomesParaMestre("cyberpunk", ["Mago", "Bola de Fogo", "Machado"]), "Na ficha, Mago aparece como Hacker; Bola de Fogo como Granada Incendiária; a mana aparece como Bateria.");
  // a lista pública de temas não muda
  for (const t of T.listaPublica().temas) assert.deepEqual(Object.keys(t), ["id", "nome", "inspiracao", "resumo", "icone"]);
});

test("nomes: o Mestre recebe os nomes do tema no contexto e na criação; o clássico fica como era", () => {
  const ficha = R.normalizarFicha({ nome: "Lia", raca: "Elfo", classe: "Mago", atributos: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 },
    magias: [{ nome: "Bola de Fogo" }], ataques: [{ nome: "Cajado", bonus: 1, dano: "1d6" }] }, "u1");
  const ctx = M.contexto({ tema: "cyberpunk", tom: "epico" }, [ficha], []);
  assert.match(ctx, /NOMES DO TEMA NA TELA DOS JOGADORES: Na ficha, .*Elfo como Modelo de Luxo;.*Mago como Hacker;.*Bola de Fogo como Granada Incendiária;.*a mana aparece como Bateria\./);
  assert.match(ctx, /- Lia \[id u1\]: Elfo Mago \(no tema: Modelo de Luxo, Hacker\) nível 1/);
  assert.match(ctx, /Magias: Bola de Fogo \(no tema: Granada Incendiária; 3º círculo, custo 4/);
  assert.match(ctx, /Mana \(no tema: Bateria\) \d+\/\d+\./);
  assert.match(ctx, /Ataques: Cajado \(\+1, 1d6\)/, "arma da ficha sem nome do tema");
  const classico = M.contexto({ tema: "classico", tom: "epico" }, [ficha], []);
  assert.ok(!classico.includes("NOMES DO TEMA") && !classico.includes("no tema:"));
  const criacao = M.promptCriacao(T.temaPorId("lendas-brasil"), "uma rezadeira");
  assert.match(criacao, /Clérigo como Rezadeira;.*Curar Ferimentos Leves como Benzedura;.*Golpe poderoso como Golpe de Facão/);
  assert.match(criacao, /"raca" e "classe" são exatamente um dos nomes das listas acima/);
  assert.ok(!M.promptCriacao(T.temaPorId("classico"), "x").includes("NOMES DO TEMA"));
  assert.match(M.promptArco({ tema: "cyberpunk", duracao: "curta", fichas: [ficha] }), /\* Lia: Modelo de Luxo Hacker/);
});

// ── API ──

let base;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}
const post = (rota, corpo, j) => api("POST", rota, { corpo, token: j?.token });
const get = (rota, j) => api("GET", rota, { token: j?.token });
async function conta(nome, email) {
  const r = await post("/api/auth/registrar", { nome, email, senha: "senha123" });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return { token: r.d.token, id: r.d.usuario.id, nome };
}
const fichaBase = (nome) => ({ nome, raca: "Anão", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }] });
function editarFicha(codigo, j, fn) {
  const f = JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, j.id).dados);
  fn(f);
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, j.id);
}
const lerFicha = (codigo, j) => R.normalizarFicha(JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, j.id).dados), j.id);
/** Mesa do tema em jogo; `extras`: {nome: campos gravados direto na ficha}. */
async function mesaEmJogo(tema, jogadores, extras = {}) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome, tema }, dono);
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, j);
  for (const j of jogadores) {
    db.prepare("DELETE FROM criacoes WHERE uid = ?").run(j.id);
    assert.equal((await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome) }, j)).st, 200);
    if (extras[j.nome]) editarFicha(d.codigo, j, (f) => { Object.assign(f, extras[j.nome]); if (!("mana" in extras[j.nome])) delete f.mana; });
  }
  assert.equal((await post("/api/comecar-aventura", { codigo: d.codigo }, dono)).st, 200);
  return d.codigo;
}
const gob = (i, extra = {}) => ({ id: `ini_${i}`, nome: `Goblin ${i + 1}`, pv: 99, pvMax: 99, ca: 13, ataque: 4, dano: "1", des: 2, alcance: "corpo", ...extra });
function combateFixo({ pjs, inimigos, posicoes }) {
  return {
    rodada: 1, vez: 0, inicioVez: Date.now(), id: "fixo",
    ordem: [...pjs.map((j) => ({ id: j.id, tipo: "pj", nome: j.nome, ini: 20 })), ...inimigos.map((i) => ({ id: i.id, tipo: "ini", nome: i.nome, ini: 5 }))],
    inimigos,
    mapa: { colunas: 10, linhas: 14, descricao: "Campo de teste", terreno: [], imagem: "" },
    posicoes: Object.fromEntries(Object.entries(posicoes).map(([id, [x, y]]) => [id, { x, y }])), deslocamento: {},
  };
}
const injetar = (codigo, c) => db.prepare("UPDATE mesas SET combate = ?, rolagem = NULL WHERE codigo = ?").run(JSON.stringify(c), codigo);
const estado = async (codigo, j) => (await get(`/api/mesa/${codigo}`, j)).d;
const diario = async (codigo, j) => (await get(`/api/mesa/${codigo}/log`, j)).d;
const acao = (codigo, j, tipo, nome, alvo) => post("/api/acao-combate", { codigo, tipo, nome, alvo }, j);
/** A linha de rolagem do jogador, lida como o app lê: começa com "<nome> · " e os números pela regex. */
function linhaDaRolagem(log, nome) {
  const e = [...log].reverse().find((x) => x.tipo === "roll" && x.texto.startsWith(`${nome} · `));
  assert.ok(e, `sem linha de rolagem de ${nome}`);
  const m = e.texto.match(REGEX_APP);
  assert.ok(m, e.texto);
  return { texto: e.texto, natural: Number(m[1]), total: Number(m[2]) };
}

let mario, lucia;
before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  mario = await conta("Mário", "mario@nomes.br");
  lucia = await conta("Lúcia", "lucia@nomes.br");
});

test("estado da mesa: `nomes` do tema, igual para todos os jogadores; mesa antiga (sem tema) = clássico", async () => {
  const { d } = await post("/api/mesa/criar", { nome: "Mário", tema: "cyberpunk" }, mario);
  await post(`/api/mesa/entrar/${d.codigo}`, { nome: "Lúcia" }, lucia);
  const m1 = await estado(d.codigo, mario), m2 = await estado(d.codigo, lucia);
  assert.deepEqual(m1.nomes, JSON.parse(JSON.stringify(T.nomesDoTema("cyberpunk"))));
  assert.deepEqual(m2.nomes, m1.nomes);
  assert.equal(m1.nomes.classes.Mago.nome, "Hacker");
  assert.equal(m1.nomes.magias["Bola de Fogo"], "Granada Incendiária");
  assert.equal(m1.nomes.atributoMagia, "Bateria");
  // trocar o tema no saguão troca os nomes
  assert.equal((await post("/api/configurar-mesa", { codigo: d.codigo, tema: "lendas-brasil" }, mario)).st, 200);
  assert.equal((await estado(d.codigo, mario)).nomes.classes["Clérigo"].nome, "Rezadeira");
  // mesas antigas: sem tema gravado, ou com um tema que não existe mais
  for (const velho of [null, "tema-que-sumiu"]) {
    db.prepare("UPDATE mesas SET tema = ? WHERE codigo = ?").run(velho, d.codigo);
    const m = await estado(d.codigo, mario);
    assert.equal(m.tema, "classico");
    assert.deepEqual(m.nomes, JSON.parse(JSON.stringify(T.nomesDoTema("classico"))));
    assert.equal(m.nomes.magias["Bola de Fogo"], "Bola de Fogo");
    assert.equal(m.nomes.atributoMagia, "Mana");
  }
  // GET /api/temas não muda
  const { d: temas } = await get("/api/temas", mario);
  for (const t of temas.temas) assert.deepEqual(Object.keys(t), ["id", "nome", "inspiracao", "resumo", "icone"]);
});

test("combate no tema: rótulo, diário e 409 com o nome do tema; a linha da rolagem no formato do app; rotas com o nome mecânico", async () => {
  const hacker = { classe: "Mago", raca: "Elfo", atributos: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 }, inventario: [],
    magias: [{ nome: "Bola de Fogo" }, { nome: "Raio de Gelo" }, { nome: "Escudo Arcano" }], mana: 5 };
  const codigo = await mesaEmJogo("cyberpunk", [mario], { "Mário": hacker });
  // a ficha continua mecânica
  const f = (await get(`/api/mesa/${codigo}/fichas`, mario)).d[mario.id];
  assert.deepEqual([f.raca, f.classe, f.magias.map((m) => m.nome)], ["Elfo", "Mago", ["Bola de Fogo", "Raio de Gelo", "Escudo Arcano"]]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));

  // nome mecânico na rota; rótulo com o nome do tema; "motivo" continua mecânico
  let r = await acao(codigo, mario, "magia", "Bola de Fogo", "ini_0");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.rolagem.rotulo, r.d.rolagem.motivo, r.d.rolagem.dano], ["Granada Incendiária vs Goblin 1", "Bola de Fogo", "8d6"]);
  assert.equal((await estado(codigo, mario)).rolagem.rotulo, "Granada Incendiária vs Goblin 1");
  let log = await diario(codigo, mario);
  assert.ok(log.some((e) => e.tipo === "acao" && e.texto === "Conjura Granada Incendiária em Goblin 1."));
  assert.equal(lerFicha(codigo, mario).mana, 1);
  assert.equal((await post("/api/rolar", { codigo, valor: 12 }, mario)).st, 200);
  log = await diario(codigo, mario);
  const linha = linhaDaRolagem(log, "Mário");
  assert.equal(linha.texto, "Mário · Granada Incendiária vs Goblin 1: 12+5 = 17 vs CA 13 (dado real)");
  assert.deepEqual([linha.natural, linha.total], [12, 17]);

  // sem mana: 409 com o nome do tema e o rótulo da barra no tema
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));
  r = await acao(codigo, mario, "magia", "Bola de Fogo", "ini_0");
  assert.deepEqual([r.st, r.d.error], [409, "Bateria insuficiente: Granada Incendiária custa 4 e você tem 1."]);
  // o app pode mandar o nome do tema por engano: o servidor aceita também
  r = await acao(codigo, mario, "magia", "jato criogênico", "ini_0");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.rolagem.rotulo, r.d.rolagem.motivo], ["Jato Criogênico vs Goblin 1", "Raio de Gelo"]);
  await post("/api/rolar", { codigo, valor: 3 }, mario);
  assert.equal(linhaDaRolagem(await diario(codigo, mario), "Mário").texto, "Mário · Jato Criogênico vs Goblin 1: 3+5 = 8 vs CA 13 (dado real)");

  // alcance: o aviso de longe demais usa o nome do tema
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [0, 13], ini_0: [9, 0] } }));
  r = await acao(codigo, mario, "magia", "Raio de Gelo", "ini_0");
  assert.deepEqual([r.st, r.d.error], [409, "Goblin 1 está a 13 casas: longe demais para Jato Criogênico (alcance de 12 casas)."]);

  // pelo Mestre: o teste de ataque com o nome mecânico vira o rótulo do tema
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));
  editarFicha(codigo, mario, (x) => { x.mana = 7; });
  r = await post("/api/agir", { codigo, texto: "Lanço a bola de fogo" }, mario);
  assert.equal(r.d.rolagem.rotulo, "Granada Incendiária vs Goblin 1");
  // o contexto do Mestre traz os nomes do tema
  assert.match(registro.ultimoPrompt, /Mago como Hacker/);
  assert.match(registro.ultimoPrompt, /Bola de Fogo como Granada Incendiária/);
  assert.match(registro.ultimoPrompt, /a mana aparece como Bateria/);
  assert.match(registro.ultimoPrompt, /Elfo Mago \(no tema: Modelo de Luxo, Hacker\)/);
  await post("/api/rolar", { codigo, valor: 1 }, mario);
  assert.equal(linhaDaRolagem(await diario(codigo, mario), "Mário").natural, 1);

  // fora de combate: dano recusado (mensagem de sempre); utilidade com o nome do tema no diário e na barra
  injetar(codigo, null);
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Bola de Fogo" }, mario)).d.error, "Magia de dano só no combate.");
  editarFicha(codigo, mario, (x) => { x.mana = 1; });
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Escudo Arcano" }, mario)).d.error, "Bateria insuficiente: Campo de Dispersão custa 2 e você tem 1.");
  editarFicha(codigo, mario, (x) => { x.mana = 7; });
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Escudo Arcano" }, mario)).st, 200);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "acao" && e.texto === "Conjura Campo de Dispersão."));
  assert.match(registro.ultimoPrompt, /conjura Campo de Dispersão: /);

  // novo dia: a barra recupera com o nome do tema
  await post("/api/agir", { codigo, texto: "Eu durmo" }, mario);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "sys" && /^Dia \d+ começa: vida e bateria recuperadas\.$/.test(e.texto)));
});

test("cura no tema: a linha do diário usa o nome do tema", async () => {
  const rezadeira = { classe: "Clérigo", atributos: { for: 12, des: 10, con: 12, int: 10, sab: 14, car: 12 }, magias: [{ nome: "Curar Ferimentos Leves" }] };
  const codigo = await mesaEmJogo("lendas-brasil", [lucia, mario], { "Lúcia": rezadeira });
  editarFicha(codigo, mario, (f) => { f.pv = 1; });
  const r = await post("/api/usar-magia", { codigo, nome: "Curar Ferimentos Leves", alvo: mario.id }, lucia);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  const log = await diario(codigo, lucia);
  assert.ok(log.some((e) => e.tipo === "acao" && e.texto === "Conjura Benzedura em Mário."));
  assert.ok(log.some((e) => e.tipo === "roll" && e.texto === `Lúcia conjura Benzedura: Mário recupera ${r.d.cura} PV`));
  editarFicha(codigo, lucia, (f) => { f.mana = 0; });
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Curar Ferimentos Leves" }, lucia)).d.error, "Encanto insuficiente: Benzedura custa 2 e você tem 0.");
});

test("evolução no tema: opções e rotas mecânicas, mensagens e \"aprendeu\" com o nome do tema; técnica no ataque", async () => {
  const hacker = { classe: "Mago", raca: "Elfo", atributos: { for: 8, des: 14, con: 13, int: 17, sab: 12, car: 8 }, inventario: [],
    magias: [{ nome: "Raio de Gelo" }, { nome: "Mísseis Mágicos" }, { nome: "Escudo Arcano" }], nivel: 3, xp: 299 };
  const codigo = await mesaEmJogo("cyberpunk", [mario, lucia], { "Mário": hacker, "Lúcia": { nivel: 1, xp: 99 } });
  await post("/api/agir", { codigo, texto: "Olho em volta" }, mario);          // nível 4
  await post("/api/agir", { codigo, texto: "Olho em volta" }, lucia);          // nível 2
  const fm = (await get(`/api/mesa/${codigo}/fichas`, mario)).d[mario.id];
  assert.ok(fm.pendencias.magias.opcoes.some((o) => o.nome === "Raio Ardente"), "as opções continuam mecânicas");
  const evoluir = (corpo, j = mario) => post("/api/evoluir", { codigo, ...corpo }, j);
  assert.equal((await evoluir({ magias: ["Bola de Fogo"] })).d.error, "Granada Incendiária não está entre as opções.");
  assert.equal((await evoluir({ magias: ["Sono", "sono"] })).d.error, "Pulso Neural foi escolhido duas vezes.");
  assert.equal((await evoluir({ magias: ["Sono", "Pulso Neural"] })).d.error, "Pulso Neural foi escolhido duas vezes.", "o nome do tema vale como o mecânico");
  assert.equal((await evoluir({ magias: ["Inventada"] })).d.error, "Inventada não está entre as opções.");
  let r = await evoluir({ magias: ["Raio Ardente", "Sono"] });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual(r.d.ficha.magias.map((m) => m.nome).slice(-2), ["Raio Ardente", "Sono"], "a ficha guarda o nome mecânico");
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "sys" && e.texto === "Mário evoluiu: aprendeu Laser de Corte, Pulso Neural."));

  // técnica da guerreira: aprende pelo nome mecânico e ataca com ele; o diário e o rótulo mostram o nome do tema
  const fl = (await get(`/api/mesa/${codigo}/fichas`, lucia)).d[lucia.id];
  assert.ok(fl.pendencias.ataques.opcoes.some((o) => o.nome === "Golpe poderoso"));
  r = await evoluir({ ataques: ["Golpe poderoso"] }, lucia);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.ok(r.d.ficha.ataques.some((a) => a.nome === "Golpe poderoso"));
  assert.ok((await diario(codigo, lucia)).some((e) => e.tipo === "sys" && e.texto === "Lúcia evoluiu: aprendeu Soco Hidráulico."));
  injetar(codigo, combateFixo({ pjs: [lucia, mario], inimigos: [gob(0)], posicoes: { [lucia.id]: [4, 12], [mario.id]: [6, 12], ini_0: [4, 11] } }));
  r = await acao(codigo, lucia, "ataque", "Golpe poderoso", "ini_0");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.rolagem.rotulo, r.d.rolagem.motivo], ["Soco Hidráulico vs Goblin 1", "Golpe poderoso"]);
  assert.ok((await diario(codigo, lucia)).some((e) => e.tipo === "acao" && e.texto === "Ataca Goblin 1 com Soco Hidráulico."));
  await post("/api/rolar", { codigo, valor: 15 }, lucia);
  const linha = linhaDaRolagem(await diario(codigo, lucia), "Lúcia");
  assert.match(linha.texto, /^Lúcia · Soco Hidráulico vs Goblin 1: 15\+\d+ = \d+ vs CA 13 \(dado real\)$/);
  assert.equal(linha.natural, 15);
  // arma comum da ficha: nome igual em qualquer tema
  injetar(codigo, combateFixo({ pjs: [lucia, mario], inimigos: [gob(0)], posicoes: { [lucia.id]: [4, 12], [mario.id]: [6, 12], ini_0: [4, 11] } }));
  r = await acao(codigo, lucia, "ataque", "Machado de batalha", "ini_0");
  assert.equal(r.d.rolagem.rotulo, "Machado de batalha vs Goblin 1");
  assert.equal((await acao(codigo, lucia, "ataque", "Bazuca", "ini_0")).d.error, "Há uma rolagem pendente.");
});

test("mesa clássica: textos de sempre (nomes de D&D)", async () => {
  const maga = { classe: "Mago", raca: "Elfo", atributos: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 }, inventario: [], magias: [{ nome: "Bola de Fogo" }], mana: 7 };
  const codigo = await mesaEmJogo(undefined, [mario], { "Mário": maga });
  db.prepare("UPDATE mesas SET tema = NULL WHERE codigo = ?").run(codigo);   // mesa de antes dos temas
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));
  const r = await acao(codigo, mario, "magia", "Bola de Fogo", "ini_0");
  assert.equal(r.d.rolagem.rotulo, "Bola de Fogo vs Goblin 1");
  await post("/api/rolar", { codigo, valor: 9 }, mario);
  assert.equal(linhaDaRolagem(await diario(codigo, mario), "Mário").texto, "Mário · Bola de Fogo vs Goblin 1: 9+5 = 14 vs CA 13 (dado real)");
  assert.ok(!registro.ultimoPrompt.includes("NOMES DO TEMA"));
});

test("criação de personagem no tema: o Mestre recebe os nomes do tema; raça e classe voltam mecânicas", async () => {
  const r = await post("/api/criar-personagem", { conceito: "uma maga hacker", tema: "cyberpunk" }, mario);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.ficha.raca, r.d.ficha.classe], ["Elfo", "Mago"]);
  for (const m of r.d.ficha.magias) assert.ok(MAGIAS.includes(m.nome), m.nome);
  assert.match(registro.ultimoPrompt, /NOMES DO TEMA NA TELA DOS JOGADORES: Na ficha, .*Elfo como Modelo de Luxo;.*Mago como Hacker;.*Mísseis Mágicos como Enxame de Microdrones/);
  // pelo código de uma mesa do tema
  const { d } = await post("/api/mesa/criar", { nome: "Mário", tema: "samurais" }, mario);
  await post("/api/criar-personagem", { conceito: "um guerreiro", codigo: d.codigo }, mario);
  assert.match(registro.ultimoPrompt, /Guerreiro como Samurai/);
});
