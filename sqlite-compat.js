/**
 * Abre o banco SQLite.
 * Usa o better-sqlite3 (produção). Se ele não estiver compilado nesta máquina,
 * usa o SQLite embutido no Node 22+ (node:sqlite) com a mesma interface usada aqui.
 */
"use strict";

function abrirBanco(caminho) {
  try {
    const Database = require("better-sqlite3");
    return new Database(caminho);
  } catch (e) {
    let DatabaseSync;
    try { ({ DatabaseSync } = require("node:sqlite")); } catch { throw e; }
    console.log("[db] better-sqlite3 indisponível; usando node:sqlite embutido.");
    const db = new DatabaseSync(caminho);
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const st = db.prepare(sql);
        const limpar = (args) => args.map((a) => (a === undefined ? null : typeof a === "boolean" ? (a ? 1 : 0) : a));
        return {
          get: (...a) => { const r = st.get(...limpar(a)); return r ? { ...r } : undefined; },
          all: (...a) => st.all(...limpar(a)).map((r) => ({ ...r })),
          run: (...a) => st.run(...limpar(a)),
        };
      },
      pragma: (p) => db.exec(`PRAGMA ${p}`),
      transaction: (fn) => (...a) => { db.exec("BEGIN"); try { const r = fn(...a); db.exec("COMMIT"); return r; } catch (err) { db.exec("ROLLBACK"); throw err; } },
      close: () => db.close(),
    };
  }
}

module.exports = { abrirBanco };
