/**
 * Fundos de cena: o maior custo da IA no modo Rápido.
 *
 * FUNDOS_MODO:
 *   reaproveitar (padrão) — usa a imagem já gerada para a mesma cena; só gera para cena nova.
 *   biblioteca            — nunca gera; usa os fundos prontos de public/fundos.
 *   gerar                 — comportamento antigo: gera a cada mudança de cena.
 * No teste grátis (com cobrança ativa) o servidor usa sempre a biblioteca.
 */
"use strict";

const MODO = ["reaproveitar", "biblioteca", "gerar"].includes(process.env.FUNDOS_MODO) ? process.env.FUNDOS_MODO : "reaproveitar";

const TEMAS = [
  ["taverna", /taverna|estalagem|hospedaria|bar\b|javali/i],
  ["mina", /mina|galeria|elevador|cristal|pedreira/i],
  ["caverna", /caverna|gruta|t[uú]nel|subterr/i],
  ["floresta", /floresta|bosque|mata|trilha|clareira/i],
  ["vila", /vila|aldeia|cidade|pra[cç]a|mercado|rua/i],
  ["masmorra", /masmorra|cripta|catacumba|pris[aã]o|cela|calabou[cç]o|andar/i],
  ["templo", /templo|santu[aá]rio|capela|altar|igreja/i],
  ["torre", /torre|pin[aá]culo|ref[uú]gio do mago/i],
  ["estrada", /estrada|caminho|ponte|rio|ponte|acampamento|campo/i],
];

function temaDaCena(cena) {
  for (const [tema, re] of TEMAS) if (re.test(String(cena || ""))) return tema;
  return "estrada";
}

function chaveDaCena(cena) {
  return String(cena || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
}

function criarFundos(db) {
  db.exec("CREATE TABLE IF NOT EXISTS fundos_cache (chave TEXT PRIMARY KEY, url TEXT NOT NULL, t INTEGER NOT NULL)");

  function daBiblioteca(cena, baseUrl) {
    return `${baseUrl || ""}/fundos/${temaDaCena(cena)}.png`;
  }

  /**
   * Escolhe o fundo da cena. `gerarImagem` só é chamada quando o modo permite.
   * Devolve { url, gerou }.
   */
  async function escolher(cena, { baseUrl, soBiblioteca, gerarImagem }) {
    const chave = chaveDaCena(cena);
    if (!chave) return { url: "", gerou: false };
    if (soBiblioteca || MODO === "biblioteca" || !gerarImagem) return { url: daBiblioteca(cena, baseUrl), gerou: false };
    if (MODO === "reaproveitar") {
      const c = db.prepare("SELECT url FROM fundos_cache WHERE chave = ?").get(chave);
      if (c?.url) return { url: c.url, gerou: false };
    }
    let url = "";
    try { url = await gerarImagem(); } catch { url = ""; }
    // Imagens SVG ou data: não abrem no app; nesses casos usa a biblioteca.
    if (!url || url.startsWith("data:")) return { url: daBiblioteca(cena, baseUrl), gerou: false };
    db.prepare("INSERT OR REPLACE INTO fundos_cache (chave, url, t) VALUES (?, ?, ?)").run(chave, url, Date.now());
    return { url, gerou: true };
  }

  return { MODO, escolher, temaDaCena, daBiblioteca };
}

module.exports = { criarFundos, temaDaCena, chaveDaCena };
