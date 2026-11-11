/**
 * Semente do painel de administração: povoa um banco de TESTE com dados fictícios de uns 45 dias
 * (contas, mesas em vários temas, fichas, diário e uso da IA), para ver o painel cheio em desenvolvimento.
 * NÃO é teste (o nome não termina em .test.js) e NUNCA deve rodar num banco de verdade.
 *
 * Como rodar, a partir da pasta do servidor (troque o caminho pelo de um arquivo temporário seu):
 *
 *   1. Crie o banco vazio com o servidor (ele cria as tabelas ao abrir):
 *        node -e "process.env.DB_PATH='C:/Temp/painel-teste.db'; require('./server').db.close()"
 *   2. Povoe:
 *        node test/semente-painel.js C:/Temp/painel-teste.db
 *   3. Suba o servidor nesse banco e abra /admin.html:
 *        PowerShell:  $env:DB_PATH='C:/Temp/painel-teste.db'; $env:ADMIN_PASS='uma-senha-de-teste'; $env:PORT='3985'; node server.js
 *        bash:        DB_PATH=C:/Temp/painel-teste.db ADMIN_PASS=uma-senha-de-teste PORT=3985 node server.js
 *
 * Travas: o NOME do arquivo precisa conter "teste", "temp" ou "tmp" (a pasta não conta: a pasta do projeto pode
 * ter "teste" no nome), nunca pode ser "mesa-viva.db", e o banco precisa já ter as tabelas do servidor.
 * Rodar de novo no mesmo banco troca os dados da semente (contas com id "sem_…" e as mesas delas); o resto fica.
 * Os dados são sempre os mesmos (sorteio com semente fixa), só as datas acompanham o dia de hoje.
 * As contas da semente não têm senha válida: não dá para entrar no jogo com elas.
 */
"use strict";
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const R = require("../regras");

const DIAS = 45, USUARIOS = 60, MESAS = 25;
const DIA_MS = 86_400_000, HORA_MS = 3_600_000, MIN_MS = 60_000;
const FUSO_MS = -180 * MIN_MS;                         // as horas de jogo são sorteadas no horário de Brasília
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function sair(msg) { console.error(`\n[semente] ${msg}\n`); process.exit(1); }

// ── Travas ──
const arg = process.argv[2];
if (!arg) sair("Informe o caminho do banco de teste: node test/semente-painel.js <arquivo.db>  (veja o cabeçalho deste arquivo)");
const caminho = path.resolve(arg);
const nomeDoArquivo = path.basename(caminho).toLowerCase();
if (nomeDoArquivo === "mesa-viva.db" || !/teste|temp|tmp/.test(nomeDoArquivo)) {
  sair(`Recusado: "${path.basename(caminho)}" não parece um banco de teste. O nome do arquivo precisa conter "teste", "temp" ou "tmp" (por exemplo painel-teste.db).`);
}
if (!fs.existsSync(caminho)) sair(`O arquivo não existe: ${caminho}\nCrie o banco antes com o servidor (passo 1 do cabeçalho deste arquivo).`);

const db = new Database(caminho, { fileMustExist: true });
const tabelas = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
const faltam = ["usuarios", "mesas", "membros", "fichas", "log", "uso_ia_diario"].filter((t) => !tabelas.has(t));
if (faltam.length) { db.close(); sair(`O banco não tem as tabelas do servidor (faltam: ${faltam.join(", ")}).\nCrie o banco antes com o servidor (passo 1 do cabeçalho deste arquivo).`); }

// ── Sorteio com semente fixa ──
let estado = 20260101;
function rnd() {                                       // mulberry32
  estado = (estado + 0x6d2b79f5) | 0;
  let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const um = (lista) => lista[Math.floor(rnd() * lista.length)];
/** Sorteia de uma lista de [valor, peso]. */
function pesado(pares) {
  let r = rnd() * pares.reduce((s, p) => s + p[1], 0);
  for (const [v, p] of pares) { r -= p; if (r <= 0) return v; }
  return pares[pares.length - 1][0];
}

// ── Material fictício ──
const NOMES = ["Aline", "Bruno", "Camila", "Diego", "Elisa", "Fábio", "Giovana", "Heitor", "Isadora", "Jonas", "Karina", "Leandro", "Marina", "Nícolas", "Olívia",
  "Paulo", "Quitéria", "Rafael", "Sabrina", "Tiago", "Úrsula", "Vítor", "Wanda", "Xavier", "Yara", "Zeca", "Lívia", "Murilo", "Noemi", "Otávio"];
const SOBRENOMES = ["Almeida", "Barros", "Cardoso", "Duarte", "Esteves", "Farias", "Guedes", "Honorato", "Ibiapina", "Jardim", "Lacerda", "Moraes", "Nogueira", "Pacheco", "Queiroz", "Ramos", "Sales", "Teles", "Uchoa", "Valente"];
const PERSONAGENS = ["Thorin", "Lyra", "Kael", "Mirela", "Borin", "Sylas", "Anya", "Dorian", "Eowen", "Faruk", "Gwen", "Hakon", "Ilsa", "Joren", "Kira", "Lucan", "Maeve", "Nestor", "Orla", "Perrin"];
const TEMAS = [["classico", 7], ["piratas", 4], ["cyberpunk", 3], ["horror-cosmico", 3], ["lendas-brasil", 3], ["escola-magia", 2], ["faroeste", 2], ["opera-espacial", 2],
  ["saga-viking", 1], ["samurais", 1], ["terra-devastada", 1], ["misterio-mansao", 1]];
const CENAS = {
  classico: ["Taverna do Javali Cego", "Estrada do Rei", "Cripta sob a Capela", "Floresta de Brumas"], piratas: ["Convés do Albatroz", "Porto de Sal Grosso", "Ilha da Caveira"],
  cyberpunk: ["Beco de Neon", "Torre da Corporação", "Mercado Negro do Setor 7"], "horror-cosmico": ["Biblioteca de Arkham", "Farol Abandonado", "Porão da Mansão"],
  "lendas-brasil": ["Beira do Rio à Noite", "Mata Fechada", "Vila de Pescadores"], "escola-magia": ["Sala de Poções", "Biblioteca Proibida"], faroeste: ["Saloon da Poeira", "Desfiladeiro Seco"],
  "opera-espacial": ["Ponte de Comando", "Hangar da Estação"], "saga-viking": ["Salão do Jarl"], samurais: ["Castelo sob a Neve"], "terra-devastada": ["Ruínas da Rodovia"], "misterio-mansao": ["Biblioteca da Mansão"],
};
const ACOES = ["Olho em volta com cuidado", "Pergunto ao taverneiro sobre o mapa", "Avanço com a arma em punho", "Tento abrir a porta sem fazer barulho", "Examino as marcas no chão",
  "Converso com o guarda", "Procuro uma passagem escondida", "Ajudo o ferido a se levantar", "Sigo o rastro até a clareira", "Guardo o amuleto e sigo em frente"];
const NARRACOES = ["A porta range e revela um corredor estreito, iluminado por tochas quase apagadas.", "O estranho sorri, mas a mão dele não sai do cabo da faca.",
  "Um vento frio atravessa a sala e apaga as velas, uma a uma.", "Do outro lado da ponte, alguém acena com uma lanterna.", "O chão treme. Algo grande acordou lá embaixo.",
  "O mapa mostra um caminho que não existe em nenhum outro registro.", "A chuva engrossa e a trilha vira lama sob os pés do grupo."];
const PERICIAS = ["Percepção", "Furtividade", "Atletismo", "Persuasão", "Investigação", "Acrobacia"];
const NIVEIS = [[1, 30], [2, 24], [3, 18], [4, 12], [5, 8], [6, 4], [7, 2], [8, 1]];
const CLASSES = [["Guerreiro", 34], ["Ladino", 26], ["Mago", 24], ["Clérigo", 16]];
// horas de jogo (Brasília): pico à noite, algum movimento à tarde e no almoço, quase nada de madrugada
const HORAS = [[0, 3], [1, 1], [9, 1], [10, 2], [11, 2], [12, 4], [13, 4], [14, 5], [15, 6], [16, 6], [17, 7], [18, 10], [19, 16], [20, 22], [21, 24], [22, 18], [23, 9]];
const MODELO_RAPIDO = "deepseek/deepseek-v4-flash", MODELO_CAPRICHADO = "anthropic/claude-sonnet-5.5", MODELO_IMAGEM = "google/gemini-2.5-flash-image";

const agora = Date.now();
const inicio = agora - DIAS * DIA_MS;
/** Começo (ms) do dia de Brasília em que `t` cai. */
const comecoDoDia = (t) => Math.floor((t + FUSO_MS) / DIA_MS) * DIA_MS - FUSO_MS;

// ── Contas: crescem com o tempo (mais cadastros nos dias recentes) ──
const usuarios = [];
for (let i = 0; i < USUARIOS; i++) {
  const nome = NOMES[i % NOMES.length], sobrenome = SOBRENOMES[(i * 7 + Math.floor(i / NOMES.length)) % SOBRENOMES.length];
  const fracao = Math.pow(rnd(), 0.85);                // puxa para o fim do período
  usuarios.push({
    id: `sem_${String(i + 1).padStart(3, "0")}`,
    nome: `${nome} ${sobrenome}`,
    email: `${R.chave(nome)}.${R.chave(sobrenome)}${i + 1}@exemplo.test`.replace(/\s+/g, ""),
    criadoEm: Math.min(agora - 5 * MIN_MS, Math.round(inicio + fracao * DIAS * DIA_MS)),
  });
}
usuarios.sort((a, b) => a.criadoEm - b.criadoEm);
for (let i = 0; i < 6; i++) usuarios[i].criadoEm = inicio + (i + 1) * 5 * HORA_MS;      // os primeiros chegam logo no começo, para haver jogo nos 45 dias

// ── Mesas, membros e fichas ──
const mesas = [], fichas = [], codigos = new Set();
const jaExiste = db.prepare("SELECT 1 FROM mesas WHERE codigo = ? AND dono NOT LIKE 'sem\\_%' ESCAPE '\\'");
for (let i = 0; i < MESAS; i++) {
  let codigo;
  do { codigo = Array.from({ length: 5 }, () => ALFABETO[Math.floor(rnd() * ALFABETO.length)]).join(""); } while (codigos.has(codigo) || jaExiste.get(codigo));
  codigos.add(codigo);
  const dono = i < 6 ? usuarios[i] : usuarios[entre(0, Math.floor(usuarios.length * 0.6))];      // os primeiros abrem mesa logo; quem chegou antes cria mais mesas
  const criadaEm = Math.min(agora - 30 * MIN_MS, dono.criadoEm + entre(10, 600) * MIN_MS + (i < 6 ? 0 : entre(0, 6)) * DIA_MS);
  const tema = pesado(TEMAS);
  const situacao = pesado([["jogo", 62], ["concluida", 18], ["lobby", 20]]);
  const mesa = { codigo, dono: dono.id, fase: situacao === "lobby" ? "lobby" : "jogo", tema, idioma: i % 6 === 5 ? "en" : "pt", tom: um(["epico", "sombrio", "comico"]),
    duracao: um(["curta", "curta", "media", "longa"]), cena: situacao === "lobby" ? "" : um(CENAS[tema] || CENAS.classico), arcoConcluido: situacao === "concluida" ? 1 : 0,
    ato: situacao === "concluida" ? 3 : situacao === "lobby" ? 1 : entre(1, 3), criadaEm, ultimaNarrativa: 0, jogadores: [] };
  // o dono e mais alguns que já tinham conta quando a mesa foi criada
  const candidatos = usuarios.filter((u) => u.id !== dono.id && u.criadoEm < criadaEm + 3 * DIA_MS);
  const quantos = Math.min(candidatos.length, situacao === "lobby" ? entre(0, 2) : entre(1, 4));
  const grupo = [dono];
  while (grupo.length < quantos + 1) { const u = um(candidatos); if (!grupo.includes(u)) grupo.push(u); }
  for (const u of grupo) {
    const j = { uid: u.id, nome: u.nome.split(" ")[0], ultimaAtividade: Math.max(criadaEm, u.criadoEm) };
    mesa.jogadores.push(j);
    if (situacao !== "lobby" || rnd() < 0.5) {
      const nivel = situacao === "lobby" ? 1 : pesado(NIVEIS);
      fichas.push({ codigo, uid: u.id, dados: R.normalizarFicha({ nome: um(PERSONAGENS), raca: um(R.RACAS), classe: pesado(CLASSES), nivel, xp: (nivel - 1) * 120 + entre(0, 90) }, u.id) });
    }
  }
  mesas.push(mesa);
}

// ── Diário: sessões de jogo espalhadas pelos dias, nas horas em que as pessoas jogam ──
const diario = [];
for (const mesa of mesas.filter((m) => m.fase === "jogo")) {
  const primeiroDia = comecoDoDia(mesa.criadaEm);
  const diasDeVida = Math.max(1, Math.round((comecoDoDia(agora) - primeiroDia) / DIA_MS) + 1);
  const sessoes = Math.min(diasDeVida * 2, entre(3, 16));
  for (let s = 0; s < sessoes; s++) {
    // fins de semana têm mais sessões: sorteia o dia duas vezes e fica com sexta, sábado ou domingo se aparecer
    let diaDaSessao = primeiroDia + entre(0, diasDeVida - 1) * DIA_MS;
    const outro = primeiroDia + entre(0, diasDeVida - 1) * DIA_MS;
    if ([5, 6, 0].includes(new Date(outro + FUSO_MS + 12 * HORA_MS).getUTCDay())) diaDaSessao = outro;
    let t = diaDaSessao + pesado(HORAS) * HORA_MS + entre(0, 59) * MIN_MS;
    if (t < mesa.criadaEm) t = mesa.criadaEm + entre(2, 30) * MIN_MS;
    const rodadas = entre(8, 42);
    for (let r = 0; r < rodadas && t < agora - MIN_MS; r++) {
      const j = um(mesa.jogadores);
      diario.push({ codigo: mesa.codigo, t, tipo: "acao", texto: um(ACOES), autor: j.uid, nome: j.nome, res: null, ok: null });
      j.ultimaAtividade = Math.max(j.ultimaAtividade, t);
      if (rnd() < 0.42) {
        const dado = entre(1, 20), bonus = entre(0, 6), cd = entre(10, 16), passou = dado + bonus >= cd;
        diario.push({ codigo: mesa.codigo, t: t + 20_000, tipo: "roll", texto: `${j.nome} · ${um(PERICIAS)}: ${dado}+${bonus} = ${dado + bonus} vs CD ${cd}`, autor: j.uid, nome: j.nome, res: passou ? "sucesso" : "falha", ok: passou ? 1 : 0 });
      }
      if (rnd() < 0.12) diario.push({ codigo: mesa.codigo, t: t + 30_000, tipo: "sys", texto: `${j.nome} ganhou ${entre(5, 30)} XP.`, autor: null, nome: null, res: null, ok: 1 });
      const tNarr = t + entre(35, 70) * 1000;
      if (tNarr < agora) { diario.push({ codigo: mesa.codigo, t: tNarr, tipo: "narr", texto: um(NARRACOES), autor: null, nome: null, res: null, ok: null }); mesa.ultimaNarrativa = Math.max(mesa.ultimaNarrativa, tNarr); }
      t += entre(90, 300) * 1000;
    }
  }
}
diario.sort((a, b) => a.t - b.t);

// ── Uso da IA por dia (UTC, como o servidor grava), acompanhando as narrações de cada dia ──
const narracoesPorDiaUtc = new Map();
for (const l of diario) if (l.tipo === "narr") { const d = new Date(l.t).toISOString().slice(0, 10); narracoesPorDiaUtc.set(d, (narracoesPorDiaUtc.get(d) || 0) + 1); }
const uso = [];
for (const [dia, narr] of narracoesPorDiaUtc) {
  const chamadas = Math.round(narr * (1.05 + rnd() * 0.15));                      // fichas criadas, resumos e novas tentativas também chamam a IA
  const caprichadas = Math.round(chamadas * (0.12 + rnd() * 0.12)), rapidas = chamadas - caprichadas;
  const texto = (modelo, n, precoEntrada, precoSaida) => {
    if (n <= 0) return;
    const entrada = n * entre(4200, 5600), saida = n * entre(260, 460);
    uso.push({ dia, tipo: "texto", modelo, chamadas: n, entrada, saida, custo: Number(((entrada * precoEntrada + saida * precoSaida) / 1e6).toFixed(6)) });
  };
  texto(MODELO_RAPIDO, rapidas, 0.28, 1.1);                                       // preço por milhão de tokens, em dólar
  texto(MODELO_CAPRICHADO, caprichadas, 3, 15);
  const imagens = Math.round(narr * (0.02 + rnd() * 0.03));
  if (imagens) uso.push({ dia, tipo: "imagem", modelo: MODELO_IMAGEM, chamadas: imagens, entrada: 0, saida: imagens * 1290, custo: Number((imagens * 0.039).toFixed(6)) });
  const reaproveitados = Math.round(narr * (0.08 + rnd() * 0.08)), daBiblioteca = Math.round(narr * (0.02 + rnd() * 0.04));
  if (reaproveitados) uso.push({ dia, tipo: "fundo-reaproveitado", modelo: "-", chamadas: reaproveitados, entrada: 0, saida: 0, custo: 0 });
  if (daBiblioteca) uso.push({ dia, tipo: "fundo-biblioteca", modelo: "-", chamadas: daBiblioteca, entrada: 0, saida: 0, custo: 0 });
}

// ── Gravação: uma transação só; os dados de uma semente anterior saem antes ──
db.transaction(() => {
  const antigas = db.prepare("SELECT codigo FROM mesas WHERE dono LIKE 'sem\\_%' ESCAPE '\\'").all().map((m) => m.codigo);
  for (const codigo of antigas) for (const t of ["log", "fichas", "membros", "mesas"]) db.prepare(`DELETE FROM ${t} WHERE codigo = ?`).run(codigo);
  db.prepare("DELETE FROM membros WHERE uid LIKE 'sem\\_%' ESCAPE '\\'").run();
  db.prepare("DELETE FROM usuarios WHERE id LIKE 'sem\\_%' ESCAPE '\\' OR email LIKE '%@exemplo.test'").run();

  const conta = db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES (?, ?, ?, '', ?)");
  for (const u of usuarios) conta.run(u.id, u.nome, u.email, u.criadoEm);
  const novaMesa = db.prepare(`INSERT INTO mesas (codigo, dono, fase, tom, cena, tema, duracao, idioma, ato, arcoConcluido, criadaEm, inicio, ultimaNarrativa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const m of mesas) novaMesa.run(m.codigo, m.dono, m.fase, m.tom, m.cena, m.tema, m.duracao, m.idioma, m.ato, m.arcoConcluido, m.criadaEm, m.fase === "jogo" ? m.criadaEm + 10 * MIN_MS : null, m.ultimaNarrativa);
  const novoMembro = db.prepare("INSERT INTO membros (codigo, uid, nome, ultimaAtividade) VALUES (?, ?, ?, ?)");
  for (const m of mesas) for (const j of m.jogadores) novoMembro.run(m.codigo, j.uid, j.nome, j.ultimaAtividade);
  const novaFicha = db.prepare("INSERT INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)");
  for (const f of fichas) novaFicha.run(f.codigo, f.uid, JSON.stringify(f.dados));
  const linha = db.prepare("INSERT INTO log (codigo, t, tipo, texto, autor, nome, res, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const l of diario) linha.run(l.codigo, l.t, l.tipo, l.texto, l.autor, l.nome, l.res, l.ok);
  const novoUso = db.prepare("INSERT OR REPLACE INTO uso_ia_diario (dia, tipo, modelo, chamadas, entrada, saida, custo) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const u of uso) novoUso.run(u.dia, u.tipo, u.modelo, u.chamadas, u.entrada, u.saida, u.custo);
})();
db.close();

const custo = uso.reduce((s, u) => s + u.custo, 0);
console.log(`[semente] ${caminho}`);
console.log(`[semente] ${usuarios.length} contas, ${mesas.length} mesas (${mesas.filter((m) => m.fase === "jogo").length} em jogo), ${fichas.length} fichas, ${diario.length} linhas de diário ` +
  `(${diario.filter((l) => l.tipo === "narr").length} narrações), ${uso.length} linhas de uso da IA (US$ ${custo.toFixed(2)}).`);
