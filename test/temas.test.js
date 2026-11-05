/**
 * Testes dos temas e do arco da história (sem servidor).
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const T = require("../temas");
const M = require("../mestre");

const IDS = ["classico", "escola-magia", "grande-jornada", "tronos", "horror-cosmico", "piratas", "faroeste", "cyberpunk", "opera-espacial",
  "terra-devastada", "londres-vapor", "olimpo", "saga-viking", "samurais", "lendas-brasil", "misterio-mansao", "ultimos-de-pe",
  "herois-mascarados", "contos-sombrios", "tavola-redonda"];
const ICONES = ["espada", "varinha", "anel", "coroa", "tentaculo", "navio", "revolver", "chip", "planeta", "caveira", "engrenagem", "raio",
  "machado", "katana", "folha", "lupa", "zumbi", "mascara", "rosa", "calice", "dado"];

test("os 20 temas do contrato, completos", () => {
  assert.deepEqual(T.TEMAS.map((t) => t.id), IDS);
  for (const t of T.TEMAS) {
    for (const k of ["nome", "inspiracao", "resumo", "icone", "ambientacao", "fichas", "estiloImagem"]) assert.ok(t[k] && typeof t[k] === "string", `${t.id}.${k}`);
    assert.ok(t.resumo.length <= 90, `${t.id}: resumo longo`);
    assert.ok(ICONES.includes(t.icone), `${t.id}: ícone ${t.icone}`);
    assert.ok(t.sementes.length >= 8 && t.sementes.length <= 12, `${t.id}: ${t.sementes.length} sementes`);
    assert.equal(new Set(t.sementes).size, t.sementes.length, `${t.id}: sementes repetidas`);
    for (const r of ["Humano", "Anão", "Elfo", "Halfling", "Meio-orc", "Guerreiro", "Ladino", "Mago", "Clérigo"]) assert.ok(t.fichas.includes(r), `${t.id}: fichas sem ${r}`);
    if (t.id !== "classico") assert.match(t.fichas, /mesmo efeito|mesma mecânica/, `${t.id}: fichas sem lembrar que a mecânica não muda`);
  }
});

test("lista pública: surpresa primeiro e só os campos públicos", () => {
  const { temas, duracoes } = T.listaPublica();
  assert.equal(temas.length, 21);
  assert.deepEqual(temas[0], { id: "surpresa", nome: "Surpresa", inspiracao: "O Mestre escolhe", resumo: temas[0].resumo, icone: "dado" });
  for (const t of temas) assert.deepEqual(Object.keys(t), ["id", "nome", "inspiracao", "resumo", "icone"]);
  assert.deepEqual(duracoes, [
    { id: "curta", nome: "Uma noite", resumo: "Aventura completa em cerca de 2 horas." },
    { id: "campanha", nome: "Campanha", resumo: "História longa, para vários encontros." },
  ]);
});

test("propriedade intelectual: nenhum nome ou termo próprio de obra protegida", () => {
  const proibidos = ["Hogwarts", "Grifin", "Sonserin", "Corvinal", "Lufa-Lufa", "Quadribol", "trouxa", "Dumbledore", "Voldemort", "Horcrux", "Expelliarmus",
    "Gandalf", "Frodo", "Sauron", "Mordor", "Hobbit", "Condado", "Valfenda", "Nazg", "mithril", "Westeros", "Lannister", "Stark", "Targaryen", "Meistre", "Patrulha da Noite",
    "Jedi", "Sith", "sabre de luz", "droide", "Wookiee", "Sparrow", "Pérola Negra", "Davy Jones", "Tortuga", "Night City", "netrunner", "replicante", "Arasaka",
    "Vault", "Pip-Boy", "Nuka", "Irmandade do Aço", "Immortan", "rocha-fantasma", "Deadlands", "errantes", "Rick Grimes", "Negan", "Poirot", "Marple",
    "Gotham", "Metrópolis", "Vingadores", "X-Men", "Batman", "Superman", "Homem-Aranha", "Pathfinder Society", "Beholder", "Forgotten Realms", "Força"];
  for (const t of T.TEMAS) {
    const tudo = [t.nome, t.resumo, t.ambientacao, t.fichas, t.estiloImagem, ...t.sementes].join(" \n ");
    for (const p of proibidos) assert.ok(!tudo.includes(p), `${t.id} usa "${p}"`);
  }
});

test("resolver tema e duração", () => {
  for (let i = 0; i < 30; i++) {
    const id = T.resolverTema("surpresa");
    assert.ok(IDS.includes(id), id);
  }
  assert.equal(T.resolverTema("nao-existe"), "classico");
  assert.equal(T.resolverTema(undefined), "classico");
  assert.equal(T.resolverTema("piratas"), "piratas");
  assert.equal(T.duracaoValida("campanha"), "campanha");
  assert.equal(T.duracaoValida("eterna"), "curta");
  assert.equal(T.temaPorId(null).id, "classico");
  assert.ok(T.temaPorId("samurais").sementes.includes(T.sortearSemente("samurais")));
});

test("arco: normaliza o da IA e recusa arco incompleto", () => {
  assert.equal(M.normalizarArco(null), null);
  assert.equal(M.normalizarArco({ titulo: "X", atos: [{ objetivo: "a" }, { objetivo: "b" }] }), null);
  assert.equal(M.normalizarArco({ titulo: "X", atos: [{ objetivo: "a" }, { objetivo: "" }, { objetivo: "c" }] }), null);
  const a = M.normalizarArco({ titulo: "  O Sino  ", vilao: "Vária", atos: [{ objetivo: "a", cenas: ["x", 3, null] }, { nome: "B", objetivo: "b" }, { objetivo: "c" }, { objetivo: "d" }], desfechos: ["v", "d", "m", "extra"] });
  assert.equal(a.titulo, "O Sino");
  assert.equal(a.atos.length, 3);
  assert.equal(a.atos[0].nome, "O Começo");
  assert.deepEqual(a.atos[0].cenas, ["x", "3"]);
  assert.equal(a.vilao.nome, "Vária");
  assert.equal(a.desfechos.length, 3);
});

test("arco público: sem segredos; null antes de começar; mesas antigas usam a reserva", () => {
  const arco = { titulo: "T", premissa: "P", vilao: { nome: "V", motivacao: "M" }, desfechos: ["d"],
    atos: [{ nome: "A1", objetivo: "o1", segredo: "s1", cenas: ["c"] }, { nome: "A2", objetivo: "o2", segredo: "s2", cenas: [] }, { nome: "A3", objetivo: "o3", segredo: "s3", cenas: [] }] };
  assert.deepEqual(M.arcoPublico({ fase: "jogo", arco: JSON.stringify(arco), ato: 2, arcoConcluido: 0 }),
    { titulo: "T", ato: 2, totalAtos: 3, nomeAto: "A2", objetivo: "o2", concluido: false });
  assert.equal(M.arcoPublico({ fase: "lobby", arco: null }), null);
  assert.equal(M.arcoPublico({ fase: "jogo", tema: null, arco: null }).titulo, "A Mina de Pedra-Funda");
  assert.equal(M.arcoPublico({ fase: "jogo", tema: "piratas", arco: null }).titulo, "Mares de Piratas");
});

test("prompts usam o tema: contexto, criação de personagem, imagem e arco", () => {
  const ficha = { uid: "u1", nome: "Lia", raca: "Elfo", classe: "Mago", pv: 6, pvMax: 6, ca: 12, atributos: { for: 8, des: 14, con: 10, int: 16, sab: 12, car: 10 }, pericias: [], ataques: [] };
  const arco = M.arcoMinimo("cyberpunk", "um protótipo roubado que está vivo");
  const mesa = { fase: "jogo", tema: "cyberpunk", duracao: "campanha", tom: "sombrio", desejos: "um romance proibido", arco, ato: 2, arcoConcluido: 0,
    arcoAjustes: JSON.stringify(["O executivo agora persegue o grupo."]), _narracoesNoAto: 4 };
  const c = M.contexto(mesa, [ficha], []);
  assert.match(c, /TEMA DA AVENTURA: Neon e Cromo/);
  assert.match(c, /ATO 1 — "O Começo" \[JÁ CUMPRIDO\]/);
  assert.match(c, /ATO 2 — "O Meio" \[ATO ATUAL\]/);
  assert.match(c, /ATO 3 — "O Fim" \[AINDA POR VIR\]/);
  assert.match(c, /O executivo agora persegue o grupo\./);
  assert.match(c, /Rumo da história desejado pelo grupo: um romance proibido/);
  assert.match(c, /Campanha \(vários encontros/);
  assert.match(c, /Narrações neste ato até agora: 4/);
  assert.match(c, /"ajuste_arco"/);
  assert.doesNotMatch(c, /Taverna Javali Cego"\s*\n- Cena atual/);
  assert.match(M.contexto({ ...mesa, arcoConcluido: 1 }, [ficha], []), /JÁ TERMINOU\. Agora é epílogo/);

  const cr = M.promptCriacao("escola-magia", "uma aluna curiosa");
  assert.match(cr, /TEMA DA MESA: Escola de Magia/);
  assert.match(cr, /Conceito: uma aluna curiosa$/);
  assert.match(M.promptImagem("samurais", "Ponte Vermelha"), /ukiyo-e.*Ponte Vermelha/);

  const pa = M.promptArco({ tema: "olimpo", duracao: "curta", fichas: [{ ...ficha, antecedente: "pastora" }], tom: "humor", vetos: "aranhas", desejos: "um deus apaixonado", semente: "SEMENTE-X", tempero: "TEMPERO-Y" });
  for (const trecho of ["TAREFA: CRIAR O ARCO DA AVENTURA", "Heróis do Olimpo", "UMA NOITE", "leve, com humor", "aranhas", "um deus apaixonado", "SEMENTE-X", "TEMPERO-Y", "pastora"]) {
    assert.ok(pa.includes(trecho), `prompt do arco sem "${trecho}"`);
  }
});
