/**
 * Créditos de sessão, teste grátis e medição de uso da IA.
 *
 * 1 crédito ≈ 1 hora de mesa no modo Rápido (o grupo inteiro).
 * Quem paga é a conta de quem criou a mesa; os convidados jogam de graça.
 *
 * Enquanto COBRANCA_ATIVA não for "true", nada é bloqueado: o uso é só medido.
 */
"use strict";

const num = (v, padrao) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? padrao : Number(v));

const CONFIG = {
  cobrancaAtiva: String(process.env.COBRANCA_ATIVA || "").toLowerCase() === "true",
  testeDias: num(process.env.TESTE_DIAS, 14),
  testeCreditos: num(process.env.TESTE_CREDITOS, 6),
  // Quanto cada coisa consome, em créditos (calibrado pela simulação do relatório).
  custo: {
    rapido: num(process.env.CREDITO_CHAMADA_RAPIDA, 0.012),
    caprichado: num(process.env.CREDITO_CHAMADA_CAPRICHADA, 0.07),
    imagem: num(process.env.CREDITO_IMAGEM, 0.04),
  },
  apoiadorCreditosMes: num(process.env.APOIADOR_CREDITOS_MES, 10),
};

const DIA_MS = 86_400_000;

/** Pacotes vendidos na loja. Os IDs devem ser criados iguais no Play Console. */
const PRODUTOS = [
  { id: "creditos_taverna_5", nome: "Taverna", creditos: 5, preco: "R$ 19,90", tipo: "consumivel" },
  { id: "creditos_aventura_12", nome: "Aventura", creditos: 12, preco: "R$ 39,90", tipo: "consumivel", destaque: true },
  { id: "creditos_campanha_30", nome: "Campanha", creditos: 30, preco: "R$ 89,90", tipo: "consumivel" },
  { id: "apoiador_mensal", nome: "Plano Apoiador", creditos: CONFIG.apoiadorCreditosMes, preco: "R$ 29,90/mês", tipo: "assinatura" },
];

function criarCreditos(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contas_creditos (
      conta TEXT PRIMARY KEY,
      creditos REAL NOT NULL DEFAULT 0,
      testeInicio INTEGER,
      testeUsado REAL NOT NULL DEFAULT 0,
      apoiadorAte INTEGER DEFAULT 0,
      atualizadoEm INTEGER
    );
    CREATE TABLE IF NOT EXISTS uso_ia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta TEXT, codigo TEXT, tipo TEXT NOT NULL, modelo TEXT,
      tokensEntrada INTEGER, tokensSaida INTEGER, custoUsd REAL,
      creditos REAL NOT NULL DEFAULT 0, deTeste INTEGER DEFAULT 0, t INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS compras (
      token TEXT PRIMARY KEY,
      conta TEXT NOT NULL, produto TEXT NOT NULL, creditos REAL NOT NULL,
      estado TEXT NOT NULL, pedido TEXT, t INTEGER NOT NULL
    );
  `);

  const agora = () => Date.now();

  function garantir(conta) {
    if (!conta) return null;
    let c = db.prepare("SELECT * FROM contas_creditos WHERE conta = ?").get(conta);
    if (!c) {
      db.prepare("INSERT INTO contas_creditos (conta, creditos, testeInicio, testeUsado, atualizadoEm) VALUES (?, 0, ?, 0, ?)").run(conta, agora(), agora());
      c = db.prepare("SELECT * FROM contas_creditos WHERE conta = ?").get(conta);
    }
    return c;
  }

  function situacao(conta) {
    const c = garantir(conta);
    if (!c) return null;
    const fimTeste = (c.testeInicio || agora()) + CONFIG.testeDias * DIA_MS;
    const diasRestantes = Math.max(0, Math.ceil((fimTeste - agora()) / DIA_MS));
    const horasTesteRestantes = Math.max(0, CONFIG.testeCreditos - (c.testeUsado || 0));
    const emTeste = agora() < fimTeste && horasTesteRestantes > 0;
    const apoiador = (c.apoiadorAte || 0) > agora();
    return {
      conta,
      cobrancaAtiva: CONFIG.cobrancaAtiva,
      creditos: Math.round((c.creditos || 0) * 100) / 100,
      teste: {
        ativo: emTeste,
        diasRestantes,
        horasRestantes: Math.round(horasTesteRestantes * 10) / 10,
        limiteHoras: CONFIG.testeCreditos,
        limiteDias: CONFIG.testeDias,
      },
      apoiador,
      apoiadorAte: c.apoiadorAte || 0,
      podeJogar: !CONFIG.cobrancaAtiva || emTeste || (c.creditos || 0) > 0,
    };
  }

  /**
   * Diz se a conta pode fazer uma chamada à IA e com que qualidade.
   * No teste grátis o Mestre fica no modo Rápido (quando a cobrança estiver ativa).
   */
  function autorizar(conta, qualidade) {
    if (!conta) return { ok: true, qualidade };
    const s = situacao(conta);
    if (!CONFIG.cobrancaAtiva) return { ok: true, qualidade, situacao: s };
    if (s.creditos > 0) return { ok: true, qualidade, situacao: s };
    if (s.teste.ativo) return { ok: true, qualidade: "rapido", situacao: s, teste: true };
    return {
      ok: false,
      situacao: s,
      motivo: "Os créditos desta mesa acabaram. Quem criou a mesa pode comprar mais na Loja, em Ajustes.",
    };
  }

  /** Desconta o uso. Usa primeiro o teste grátis, depois os créditos comprados. */
  function registrarUso(conta, { codigo, tipo, modelo, usage, qualidade }) {
    const creditos = tipo === "imagem" ? CONFIG.custo.imagem : (qualidade === "caprichado" ? CONFIG.custo.caprichado : CONFIG.custo.rapido);
    let deTeste = 0;
    if (conta) {
      const s = situacao(conta);
      if (s.teste.ativo) {
        db.prepare("UPDATE contas_creditos SET testeUsado = testeUsado + ?, atualizadoEm = ? WHERE conta = ?").run(creditos, agora(), conta);
        deTeste = 1;
      } else if (CONFIG.cobrancaAtiva) {
        db.prepare("UPDATE contas_creditos SET creditos = MAX(0, creditos - ?), atualizadoEm = ? WHERE conta = ?").run(creditos, agora(), conta);
      }
    }
    db.prepare(`INSERT INTO uso_ia (conta, codigo, tipo, modelo, tokensEntrada, tokensSaida, custoUsd, creditos, deTeste, t)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      conta || null, codigo || null, tipo, modelo || null,
      usage?.prompt_tokens ?? null, usage?.completion_tokens ?? null, usage?.cost ?? null,
      creditos, deTeste, agora(),
    );
  }

  function creditar(conta, quantidade) {
    garantir(conta);
    db.prepare("UPDATE contas_creditos SET creditos = creditos + ?, atualizadoEm = ? WHERE conta = ?").run(quantidade, agora(), conta);
  }

  function ativarApoiador(conta, ate) {
    garantir(conta);
    db.prepare("UPDATE contas_creditos SET apoiadorAte = MAX(COALESCE(apoiadorAte, 0), ?), atualizadoEm = ? WHERE conta = ?").run(ate, agora(), conta);
  }

  /** Resumo de uso para o painel admin: custo real (quando o OpenRouter informa) e créditos. */
  function resumoUso(dias = 30) {
    const desde = agora() - dias * DIA_MS;
    return db.prepare(`
      SELECT tipo, COUNT(*) AS chamadas, SUM(tokensEntrada) AS tokensEntrada, SUM(tokensSaida) AS tokensSaida,
             ROUND(SUM(custoUsd), 4) AS custoUsd, ROUND(SUM(creditos), 3) AS creditos
      FROM uso_ia WHERE t >= ? GROUP BY tipo`).all(desde);
  }

  return { CONFIG, PRODUTOS, garantir, situacao, autorizar, registrarUso, creditar, ativarApoiador, resumoUso };
}

module.exports = { criarCreditos, CONFIG, PRODUTOS };
