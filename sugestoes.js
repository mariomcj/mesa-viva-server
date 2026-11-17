/**
 * Sugestões dos jogadores: o app manda um texto curto (Ajustes → Sobre → Enviar sugestão) e o dono lê no painel.
 *
 * - `POST /api/sugestao` (logado): `{ texto, contato? }`. Texto de 5 a 1500 caracteres; até 5 por conta a cada 24 h.
 *   Guarda a conta, a versão do app (`x-app-versao`) e o idioma (`x-idioma`).
 * - Painel: `GET /api/admin/sugestoes` (as 300 mais novas, com nome e email da conta) e
 *   `POST /api/admin/sugestoes/:id/lida` (`{ lida: true|false }`).
 * Tabela: `sugestoes`.
 */
"use strict";

const MIN = 5, MAX = 1500, MAX_CONTATO = 120;
const LIMITE_DIA = 5;
const DIA_MS = 24 * 60 * 60_000;

/** Confere o pedido do app. Devolve `{ texto, contato }` ou `{ erro }`. */
function conferir(corpo) {
  const bruto = typeof corpo?.texto === "string" ? corpo.texto : "";
  const texto = bruto.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (texto.length < MIN) return { erro: "Escreva um pouco mais (pelo menos 5 letras)." };
  if (texto.length > MAX) return { erro: `A sugestão pode ter até ${MAX} caracteres.` };
  const contato = typeof corpo?.contato === "string" ? corpo.contato.trim().slice(0, MAX_CONTATO) : "";
  return { texto, contato };
}

function instalar(d) {
  const { app, db, authMw, adminMw, erro, agora } = d;
  db.exec(`CREATE TABLE IF NOT EXISTS sugestoes (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, uid TEXT NOT NULL, texto TEXT NOT NULL,
      contato TEXT NOT NULL DEFAULT '', versao TEXT NOT NULL DEFAULT '', idioma TEXT NOT NULL DEFAULT '', lida INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS sugestoes_uid_t ON sugestoes (uid, t);`);

  app.post("/api/sugestao", authMw, (req, res) => {
    const p = conferir(req.body);
    if (p.erro) return erro(res, 400, p.erro);
    const t = agora();
    const recentes = db.prepare("SELECT COUNT(*) n FROM sugestoes WHERE uid = ? AND t > ?").get(req.uid, t - DIA_MS).n;
    if (recentes >= LIMITE_DIA) return erro(res, 429, "Você já mandou várias sugestões hoje. Obrigado! Tente de novo amanhã.");
    const versao = String(req.get("x-app-versao") || "").slice(0, 20);
    const idioma = String(req.get("x-idioma") || "").slice(0, 10);
    const r = db.prepare("INSERT INTO sugestoes (t, uid, texto, contato, versao, idioma) VALUES (?, ?, ?, ?, ?, ?)").run(t, req.uid, p.texto, p.contato, versao, idioma);
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
  });

  if (adminMw) {
    app.get("/api/admin/sugestoes", adminMw, (req, res) => {
      const lista = db.prepare(`SELECT s.id, s.t, s.uid, s.texto, s.contato, s.versao, s.idioma, s.lida, u.nome usuario, u.email
        FROM sugestoes s LEFT JOIN usuarios u ON u.id = s.uid ORDER BY s.id DESC LIMIT 300`).all()
        .map((s) => ({ ...s, lida: !!s.lida }));
      const naoLidas = db.prepare("SELECT COUNT(*) n FROM sugestoes WHERE lida = 0").get().n;
      res.json({ sugestoes: lista, naoLidas, total: db.prepare("SELECT COUNT(*) n FROM sugestoes").get().n });
    });
    app.post("/api/admin/sugestoes/:id/lida", adminMw, (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return erro(res, 400, "Sugestão inválida.");
      const lida = req.body?.lida === undefined ? true : req.body.lida === true;
      const r = db.prepare("UPDATE sugestoes SET lida = ? WHERE id = ?").run(lida ? 1 : 0, id);
      if (!r.changes) return erro(res, 404, "Sugestão não encontrada.");
      res.json({ ok: true, lida });
    });
  }
}

module.exports = { instalar, conferir, LIMITE_DIA, MAX };
