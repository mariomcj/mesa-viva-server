/**
 * Mestre falso para os testes: substitui só as chamadas ao openrouter.ai.
 * Responde de forma previsível a partir de palavras-chave da ação, sem gastar créditos.
 */
"use strict";

const contagem = { texto: 0, imagem: 0, arco: 0 };
const registro = { ultimoPrompt: "", imagens: [] };
const fetchReal = globalThis.fetch;
const resposta = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });

/** Arco previsível; os textos privados têm marcas (SEGREDO-, CENA-, DESFECHO-) para os testes procurarem vazamentos. */
function arcoFalso(prompt) {
  const tema = (prompt.match(/^TEMA: (.+?) \(/m) || [])[1] || "?";
  const semente = (prompt.match(/^ELEMENTO-SEMENTE[^:]*: (.+)$/m) || [])[1] || "";
  return {
    titulo: `O Sino Roubado (${tema})`,
    premissa: `Um sino sagrado sumiu. Semente: ${semente}`,
    vilao: { nome: "Vária Corvo", motivacao: "SEGREDO-VILAO quer silenciar a cidade." },
    atos: [
      { nome: "A Chegada", objetivo: "Descobrir quem roubou o sino.", segredo: "SEGREDO-1", cenas: ["CENA-1a", "CENA-1b"] },
      { nome: "O Cerco", objetivo: "Encontrar o esconderijo do ladrão.", segredo: "SEGREDO-2", cenas: ["CENA-2a"] },
      { nome: "O Último Toque", objetivo: "Recuperar o sino antes da meia-noite.", segredo: "SEGREDO-3", cenas: ["CENA-3a"] },
    ],
    desfechos: ["DESFECHO-vitoria", "DESFECHO-derrota", "DESFECHO-meio"],
  };
}

function decidir(prompt) {
  if (prompt.includes("TAREFA: CRIAR O ARCO DA AVENTURA")) {
    contagem.arco++;
    if (prompt.includes("arco-falha")) throw new Error("falha simulada do arco");
    if (prompt.includes("arco-torto")) return { titulo: "Sem atos" };
    return arcoFalso(prompt);
  }
  const ev = prompt.slice(prompt.lastIndexOf("EVENTO:"));
  const nomes = [...prompt.matchAll(/^- (.+?) \[id /gm)].map((m) => m[1]);
  const atoAtual = Number((prompt.match(/^- Ato atual: (\d)/m) || [])[1] || 1);
  if (prompt.includes("Conceito:") && !prompt.includes("EVENTO:")) {
    return { nome: "Thorin Pé-de-Ferro", sexo: "Masculino", raca: "Anão", classe: "Guerreiro", antecedente: "Ferreiro",
      atributos: { for: 16, des: 12, con: 15, int: 8, sab: 12, car: 9 }, ca: 16, pericias: ["Atletismo", "Intimidação"],
      ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }], dica: "Use a força para abrir caminho." };
  }
  if (prompt.includes("sugira 3 ações")) return ["Pergunto a Odila sobre a mina.", "Procuro rastros.", "Pago uma rodada."];
  if (ev.includes("Abertura da sessão")) return { narracao: `No começo da história, ${nomes.join(" e ")} ouvem passos.`, cena: "Praça do Sino", resumo: "O grupo chegou à praça.", ato: 3, fim: true };
  if (prompt.includes("Turno dos inimigos")) return { narracao: "Os goblins atacam com fúria." };
  if (ev.includes("Resultado de um teste")) {
    // uma ação com "torre do sino" cumpre o objetivo do ato no resultado da rolagem
    if (prompt.includes("torre do sino")) return { narracao: "Do alto da torre, vocês veem tudo.", ato: atoAtual + 1, ajuste_arco: "O grupo viu o esconderijo do alto da torre." };
    return { narracao: "O resultado se desenrola diante de todos." };
  }
  const m = ev.match(/^EVENTO: (.+?) \(id (\w+)\) declara a ação: "([\s\S]*?)"\n/);
  if (m) {
    const [, , uid, acao] = m;
    const a = acao.toLowerCase();
    const emCombate = prompt.includes("EM COMBATE");
    const linha = prompt.split("\n").find((l) => l.includes(`[id ${uid}]`)) || "";
    const ataque = (linha.match(/Ataques: (.+?) \(/) || [])[1] || "";
    const alvo = (prompt.match(/\[id (ini_\d+)\]: PV [1-9]/) || [])[1];
    if (a.includes("prefacio")) return "Claro! Aqui está:\n" + JSON.stringify({ narracao: "Você olha ao redor." });
    if (a.includes("falhar")) throw new Error("falha simulada");
    if (emCombate && a.includes("golpeio")) return { narracao: "Você golpeia!", teste: { tipo: "ataque", ataque: ataque.toUpperCase(), alvo } };
    if (emCombate && /atac|ataco/.test(a)) return { narracao: "Você avança!", teste: { tipo: "ataque", ataque, alvo } };
    if (!emCombate && a.includes("goblin")) return { narracao: "Dois goblins saltam das sombras!", combate: { inimigos: [
      { nome: "Goblin 1", pv: 7, ca: 13, ataque: 4, dano: "1d6+2", des: 2 }, { nome: "Goblin 2", pv: 7, ca: 13, ataque: 4, dano: "1d6+2", des: 2 }] } };
    if (a.includes("cumpro o objetivo")) return { narracao: "A história dá uma virada.", ato: atoAtual + 1 };
    if (a.includes("salto para o fim")) return { narracao: "Tudo acontece de uma vez!", ato: 3 };
    if (a.includes("encerro a história")) return { narracao: "E assim a história termina.", fim: true };
    if (a.includes("mudo o rumo")) return { narracao: "O vilão hesita.", ajuste_arco: `Ajuste ${Date.now() % 100000}: o vilão agora deve um favor ao grupo.` };
    if (a.includes("escal")) return { narracao: "O muro é alto e úmido.", teste: { tipo: "pericia", pericia: "atletismo", cd: 12, motivo: "muro úmido" } };
    return { narracao: "A taverna reage ao que você fez.", cena: "Taverna Javali Cego" };
  }
  return { narracao: "..." };
}

globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://openrouter.ai/api/v1/images")) { contagem.imagem++; registro.imagens.push(JSON.parse(opts.body).prompt); return resposta({ data: [{ url: "https://imagens.exemplo/cena.png" }] }); }
  if (u.startsWith("https://openrouter.ai/api/v1/chat")) {
    contagem.texto++;
    const prompt = JSON.parse(opts.body).messages.map((x) => x.content).join("\n");
    registro.ultimoPrompt = prompt;
    let r;
    try { r = decidir(prompt); } catch { return new Response("erro", { status: 500 }); }
    return resposta({ choices: [{ message: { content: typeof r === "string" ? r : JSON.stringify(r) } }] });
  }
  return fetchReal(url, opts);
};

module.exports = { contagem, registro };
