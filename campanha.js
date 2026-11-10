/**
 * Memória da campanha e conteúdo extra da mesa:
 * flags de mundo, atitude dos NPCs, reputação, bestiário, pontos de salvamento,
 * votação do grupo e expedições (masmorra por andares e torre "subir ou parar").
 */
"use strict";

const R = require("./regras");

function criarCampanha(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flags_mesa (
      codigo TEXT NOT NULL, tipo TEXT NOT NULL, chave TEXT NOT NULL,
      valor TEXT, cena TEXT, capitulo INTEGER, t INTEGER NOT NULL,
      PRIMARY KEY (codigo, tipo, chave)
    );
    CREATE TABLE IF NOT EXISTS bestiario (
      codigo TEXT NOT NULL, nome TEXT NOT NULL, ca INTEGER, pvMax INTEGER,
      elemento TEXT, fraquezas TEXT, resistencias TEXT,
      derrotados INTEGER NOT NULL DEFAULT 0, primeiraCena TEXT, t INTEGER NOT NULL,
      PRIMARY KEY (codigo, nome)
    );
    CREATE TABLE IF NOT EXISTS saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL, nome TEXT NOT NULL, t INTEGER NOT NULL, dados TEXT NOT NULL
    );
  `);

  const agora = () => Date.now();
  const limpar = (s, max) => String(s ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, max);

  // ── Flags, NPCs e reputação ──
  function registrarMundo(codigo, r, cena, capitulo) {
    const novos = [];
    const up = db.prepare(`INSERT INTO flags_mesa (codigo, tipo, chave, valor, cena, capitulo, t) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(codigo, tipo, chave) DO UPDATE SET valor = excluded.valor, cena = excluded.cena, capitulo = excluded.capitulo, t = excluded.t`);
    const chaveOk = (k) => limpar(k, 40).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_ ]/g, "").replace(/\s+/g, "_");
    if (r?.flags && typeof r.flags === "object" && !Array.isArray(r.flags)) {
      for (const [k, v] of Object.entries(r.flags).slice(0, 8)) {
        const chave = chaveOk(k);
        if (!chave) continue;
        up.run(codigo, "flag", chave, limpar(String(v), 80), cena || null, capitulo, agora());
        novos.push({ tipo: "flag", chave, valor: String(v) });
      }
    }
    if (r?.npcs && typeof r.npcs === "object" && !Array.isArray(r.npcs)) {
      for (const [k, v] of Object.entries(r.npcs).slice(0, 6)) {
        const nome = limpar(k, 40);
        if (!nome) continue;
        up.run(codigo, "npc", nome, limpar(String(v), 80), cena || null, capitulo, agora());
        novos.push({ tipo: "npc", chave: nome, valor: String(v) });
      }
    }
    if (r?.reputacao && typeof r.reputacao === "object" && !Array.isArray(r.reputacao)) {
      for (const [k, v] of Object.entries(r.reputacao).slice(0, 4)) {
        const faccao = limpar(k, 40);
        const delta = Math.max(-2, Math.min(2, Math.round(Number(v) || 0)));
        if (!faccao || !delta) continue;
        const atual = Number(db.prepare("SELECT valor FROM flags_mesa WHERE codigo = ? AND tipo = 'rep' AND chave = ?").get(codigo, faccao)?.valor || 0);
        const novo = Math.max(-10, Math.min(10, atual + delta));
        up.run(codigo, "rep", faccao, String(novo), cena || null, capitulo, agora());
        novos.push({ tipo: "rep", chave: faccao, valor: novo, delta });
      }
    }
    return novos;
  }

  function memoria(codigo) {
    const rows = db.prepare("SELECT tipo, chave, valor FROM flags_mesa WHERE codigo = ? ORDER BY t").all(codigo);
    const out = { flags: {}, npcs: {}, reputacao: {} };
    for (const r of rows) {
      if (r.tipo === "flag") out.flags[r.chave] = r.valor;
      else if (r.tipo === "npc") out.npcs[r.chave] = r.valor;
      else if (r.tipo === "rep") out.reputacao[r.chave] = Number(r.valor);
    }
    return out;
  }

  // ── Bestiário ──
  function registrarDerrota(codigo, inimigo, cena) {
    const nome = String(inimigo.nome || "").replace(/\s+\d+$/, "").trim().slice(0, 40) || "Criatura";
    db.prepare(`INSERT INTO bestiario (codigo, nome, ca, pvMax, elemento, fraquezas, resistencias, derrotados, primeiraCena, t)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(codigo, nome) DO UPDATE SET derrotados = derrotados + 1`)
      .run(codigo, nome, inimigo.ca || null, inimigo.pvMax || null, inimigo.elemento || null,
        JSON.stringify(inimigo.fraquezas || []), JSON.stringify(inimigo.resistencias || []), cena || null, agora());
  }

  function bestiario(codigo) {
    return db.prepare("SELECT * FROM bestiario WHERE codigo = ? ORDER BY t").all(codigo).map((b) => ({
      ...b, fraquezas: safeJson(b.fraquezas, []), resistencias: safeJson(b.resistencias, []),
    }));
  }

  // ── Pontos de salvamento ──
  function salvar(codigo, nome) {
    const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    if (!mesa) return null;
    const fichas = db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo);
    const flags = db.prepare("SELECT * FROM flags_mesa WHERE codigo = ?").all(codigo);
    const dados = JSON.stringify({ mesa, fichas, flags });
    const r = db.prepare("INSERT INTO saves (codigo, nome, t, dados) VALUES (?, ?, ?, ?)").run(codigo, String(nome || "Ponto de salvamento").slice(0, 40), agora(), dados);
    return Number(r.lastInsertRowid);
  }

  function listarSaves(codigo) {
    return db.prepare("SELECT id, nome, t FROM saves WHERE codigo = ? ORDER BY t DESC").all(codigo);
  }

  function apagarSave(codigo, id) {
    db.prepare("DELETE FROM saves WHERE codigo = ? AND id = ?").run(codigo, id);
  }

  /** Volta a mesa, as fichas e as flags para o estado salvo. O diário não é apagado. */
  function carregarSave(codigo, id) {
    const s = db.prepare("SELECT * FROM saves WHERE codigo = ? AND id = ?").get(codigo, id);
    if (!s) return false;
    const { mesa, fichas, flags } = JSON.parse(s.dados);
    const campos = ["fase", "cena", "resumo", "combate", "fundo", "capitulo", "clima", "periodo", "aventuraConcluida", "expedicao"];
    const sets = campos.filter((c) => c in mesa);
    if (sets.length) db.prepare(`UPDATE mesas SET ${sets.map((c) => `${c} = ?`).join(", ")}, rolagem = NULL, processando = NULL, votacao = NULL, saque = NULL WHERE codigo = ?`).run(...sets.map((c) => mesa[c]), codigo);
    db.prepare("DELETE FROM fichas WHERE codigo = ?").run(codigo);
    for (const f of fichas) db.prepare("INSERT INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(codigo, f.uid, f.dados);
    db.prepare("DELETE FROM flags_mesa WHERE codigo = ?").run(codigo);
    for (const f of flags) db.prepare("INSERT INTO flags_mesa (codigo, tipo, chave, valor, cena, capitulo, t) VALUES (?, ?, ?, ?, ?, ?, ?)").run(codigo, f.tipo, f.chave, f.valor, f.cena, f.capitulo, f.t);
    return s.nome;
  }

  // ── Votação ──
  function abrirVotacao(tipo, pergunta, opcoes, dados = {}) {
    return { id: `v_${agora().toString(36)}`, tipo, pergunta, opcoes, votos: {}, dados, criadaEm: agora() };
  }

  /** Registra o voto. Decide por maioria de quem tem personagem vivo; empate fica com a primeira opção. */
  function votar(votacao, uid, opcao, eleitores) {
    if (!votacao || !votacao.opcoes.includes(opcao)) return { valido: false };
    votacao.votos[uid] = opcao;
    const total = eleitores.length || 1;
    const contagem = {};
    for (const v of Object.values(votacao.votos)) contagem[v] = (contagem[v] || 0) + 1;
    const lider = votacao.opcoes.reduce((a, b) => ((contagem[b] || 0) > (contagem[a] || 0) ? b : a), votacao.opcoes[0]);
    const votaram = eleitores.filter((u) => votacao.votos[u]).length;
    const decidida = (contagem[lider] || 0) > total / 2 || votaram >= total;
    return { valido: true, decidida, resultado: decidida ? lider : null, contagem };
  }

  // ── Expedições ──
  const SALAS = ["monstro", "bau", "armadilha", "monstro", "descanso", "monstro", "bau"];

  function novaExpedicao(modo) {
    return { modo: modo === "torre" ? "torre" : "masmorra", andar: 0, ouro: 0, ativa: true, sala: null };
  }

  /** Sorteia a próxima sala. A cada 5 andares, um chefe. Na torre, todo andar é combate. */
  function proximaSala(exp, rng = Math.random) {
    exp.andar += 1;
    if (exp.andar % 5 === 0) exp.sala = "chefe";
    else if (exp.modo === "torre") exp.sala = "monstro";
    else exp.sala = SALAS[Math.floor(rng() * SALAS.length)];
    return exp.sala;
  }

  /**
   * Nível efetivo de uma sala: o nível médio do grupo, +1 a cada bloco de 5 andares (6 a 10, 11 a 15...).
   * Dentro do bloco o perigo é o desgaste: o PV não volta sozinho (só nas salas de descanso),
   * enquanto o ouro acumulado cresce a cada andar. É essa a aposta do "subir ou parar".
   */
  function nivelDaSala(exp, fichas) {
    const { nivel } = R.perfilGrupo(fichas);
    return nivel + Math.floor(Math.max(0, (exp.andar || 1) - 1) / 5);
  }

  /** Inimigos da sala, pela tabela de referência de regras.js (mesma usada para a IA). */
  function inimigosDaSala(exp, fichas, rng = Math.random) {
    const vivos = fichas.filter((f) => f.pv === undefined || f.pv > 0);
    const n = Math.max(1, vivos.length || fichas.length);
    const nivel = nivelDaSala(exp, vivos.length ? vivos : fichas);
    const elementos = ["fogo", "gelo", "raio", "sagrado", "sombrio", "veneno"];
    const el = () => elementos[Math.floor(rng() * elementos.length)];
    const nomes = ["Esqueleto", "Rato gigante", "Goblin", "Aranha da cripta", "Cultista", "Lodo", "Sombra"];
    if (exp.sala === "chefe") {
      const [chefe, ...capangas] = R.encontroReferencia(nivel, n, "chefe");
      const fraco = el();
      const base = nomes[Math.floor(rng() * nomes.length)];
      return [{
        ...chefe,
        nome: exp.modo === "torre" ? `Guardião do andar ${exp.andar}` : `Senhor das profundezas (andar ${exp.andar})`,
        elemento: el(), fraquezas: [fraco], resistencias: [el()].filter((x) => x !== fraco),
        aplica: { status: rng() < 0.5 ? "atordoado" : "em_chamas", chance: 0.2, turnos: 1 },
      }, ...capangas.map((c, i) => ({ ...c, nome: `${base} ${i + 1}`, fraquezas: [el()] }))];
    }
    const base = nomes[Math.floor(rng() * nomes.length)];
    const lista = R.encontroReferencia(nivel, n, "comum");
    return lista.map((c, i) => ({
      ...c,
      nome: `${base} ${i + 1}`,
      comportamento: rng() < 0.4 ? "covarde" : "agressivo",
      fraquezas: [el()],
      aplica: base === "Aranha da cripta" || base === "Lodo" ? { status: "envenenado", chance: 0.3, turnos: 2 } : null,
    }));
  }

  /** Ouro acumulado por andar: cresce a cada andar (torre: risco maior, recompensa maior). */
  function recompensaDoAndar(exp) {
    const base = exp.modo === "torre" ? 15 : 10;
    return Math.round(base * Math.pow(exp.modo === "torre" ? 1.5 : 1.3, exp.andar - 1)) + (exp.sala === "chefe" ? 50 : 0);
  }

  return {
    registrarMundo, memoria, registrarDerrota, bestiario,
    salvar, listarSaves, carregarSave, apagarSave,
    abrirVotacao, votar,
    novaExpedicao, proximaSala, inimigosDaSala, recompensaDoAndar, nivelDaSala,
  };
}

function safeJson(s, padrao) { try { return JSON.parse(s); } catch { return padrao; } }

module.exports = { criarCampanha };
