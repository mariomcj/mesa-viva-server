/**
 * Catálogo de magias (Mago e Clérigo) e técnicas de combate (Guerreiro e Ladino).
 * Nomes mecânicos fixos, em português; o Mestre narra cada um no sabor do tema da mesa.
 *
 * Magia: { nome, classes, circulo (0 = truque, 1..5), tipo: "dano"|"cura"|"utilidade", efeito, alcance: "corpo"|"distancia"|"pessoal", descricao }
 *   - custo de mana = 0 no truque, círculo + 1 nos demais;
 *   - truque de dano (escala: true) ganha dados nos níveis 5, 11 e 17 (como no D&D);
 *   - dano de magia não soma atributo; a cura já traz o bônus fixo na expressão.
 * Técnica: { nome, classe, nivelMinimo, atributo: "for"|"des", dano (sem o atributo), bonusExtra, alcance, descricao }
 *   - vira um ataque da ficha: bônus = proficiência + mod(atributo) + bonusExtra; dano = dano + mod(atributo).
 *
 * Equilíbrio (nível 1–20): dano médio por círculo perto do D&D 5e para um alvo (1º ~10, 2º ~14, 3º ~28,
 * 4º ~31, 5º ~36); técnicas crescem com o nível mínimo, sem passar o dano de uma magia do círculo equivalente.
 */
"use strict";

const MAGIAS = [
  // ── Mago (Inteligência) ──
  { nome: "Raio de Gelo", classes: ["Mago"], circulo: 0, tipo: "dano", efeito: "1d8", alcance: "distancia", escala: true, descricao: "Um raio gelado que fere e deixa o alvo mais lento." },
  { nome: "Toque Chocante", classes: ["Mago"], circulo: 0, tipo: "dano", efeito: "1d8", alcance: "corpo", escala: true, descricao: "Uma descarga elétrica na ponta dos dedos." },
  { nome: "Mãos Mágicas", classes: ["Mago"], circulo: 0, tipo: "utilidade", efeito: "", alcance: "distancia", descricao: "Uma mão espectral que pega, empurra ou abre coisas leves à distância." },
  { nome: "Mísseis Mágicos", classes: ["Mago"], circulo: 1, tipo: "dano", efeito: "3d4+3", alcance: "distancia", descricao: "Três dardos de energia que buscam o alvo." },
  { nome: "Mãos Flamejantes", classes: ["Mago"], circulo: 1, tipo: "dano", efeito: "3d6", alcance: "corpo", descricao: "Um leque de chamas sai das mãos abertas." },
  { nome: "Escudo Arcano", classes: ["Mago"], circulo: 1, tipo: "utilidade", efeito: "", alcance: "pessoal", descricao: "Uma barreira invisível que desvia golpes por um instante." },
  { nome: "Sono", classes: ["Mago"], circulo: 1, tipo: "utilidade", efeito: "", alcance: "distancia", descricao: "Uma névoa sonolenta que derruba criaturas fracas." },
  { nome: "Passos Longos", classes: ["Mago"], circulo: 1, tipo: "utilidade", efeito: "", alcance: "pessoal", descricao: "Os passos ficam leves e rápidos por uma hora." },
  { nome: "Raio Ardente", classes: ["Mago"], circulo: 2, tipo: "dano", efeito: "4d6", alcance: "distancia", descricao: "Três feixes de fogo disparados de uma vez." },
  { nome: "Passo Nebuloso", classes: ["Mago"], circulo: 2, tipo: "utilidade", efeito: "", alcance: "pessoal", descricao: "Some numa névoa prateada e reaparece a alguns metros." },
  { nome: "Visão das Sombras", classes: ["Mago"], circulo: 2, tipo: "utilidade", efeito: "", alcance: "pessoal", descricao: "Enxerga no escuro como se fosse dia." },
  { nome: "Bola de Fogo", classes: ["Mago"], circulo: 3, tipo: "dano", efeito: "8d6", alcance: "distancia", descricao: "Uma esfera de fogo que explode no alvo." },
  { nome: "Relâmpago", classes: ["Mago"], circulo: 3, tipo: "dano", efeito: "8d6", alcance: "distancia", descricao: "Um raio que atravessa o ar com um estrondo." },
  { nome: "Contramágica", classes: ["Mago"], circulo: 3, tipo: "utilidade", efeito: "", alcance: "distancia", descricao: "Desfaz uma magia que está sendo lançada." },
  { nome: "Tempestade de Gelo", classes: ["Mago"], circulo: 4, tipo: "dano", efeito: "2d8+4d6", alcance: "distancia", descricao: "Granizo pesado despenca sobre o alvo." },
  { nome: "Porta Dimensional", classes: ["Mago"], circulo: 4, tipo: "utilidade", efeito: "", alcance: "pessoal", descricao: "Abre uma passagem para um lugar que se vê ou conhece." },
  { nome: "Cone de Frio", classes: ["Mago"], circulo: 5, tipo: "dano", efeito: "8d8", alcance: "distancia", descricao: "Um sopro de frio cortante que congela tudo à frente." },
  { nome: "Muralha de Pedra", classes: ["Mago"], circulo: 5, tipo: "utilidade", efeito: "", alcance: "distancia", descricao: "Ergue uma parede de pedra sólida." },

  // ── Clérigo (Sabedoria) ──
  { nome: "Chama Sagrada", classes: ["Clérigo"], circulo: 0, tipo: "dano", efeito: "1d8", alcance: "distancia", escala: true, descricao: "Uma luz que desce do alto e queima o alvo." },
  { nome: "Orientação", classes: ["Clérigo"], circulo: 0, tipo: "utilidade", efeito: "", alcance: "corpo", descricao: "Uma bênção rápida que ajuda um aliado na próxima tarefa." },
  { nome: "Curar Ferimentos Leves", classes: ["Clérigo"], circulo: 1, tipo: "cura", efeito: "1d8+3", alcance: "corpo", descricao: "Um toque que fecha cortes e alivia a dor." },
  { nome: "Palavra Curativa", classes: ["Clérigo"], circulo: 1, tipo: "cura", efeito: "1d4+3", alcance: "distancia", descricao: "Uma palavra de fé que cura um aliado à distância." },
  { nome: "Infligir Ferimentos", classes: ["Clérigo"], circulo: 1, tipo: "dano", efeito: "3d10", alcance: "corpo", descricao: "Um toque que abre feridas no inimigo." },
  { nome: "Bênção", classes: ["Clérigo"], circulo: 1, tipo: "utilidade", efeito: "", alcance: "distancia", descricao: "Os aliados se sentem mais firmes e certeiros." },
  { nome: "Arma Espiritual", classes: ["Clérigo"], circulo: 2, tipo: "dano", efeito: "2d8", alcance: "distancia", descricao: "Uma arma de luz que flutua e golpeia o inimigo." },
  { nome: "Oração Curativa", classes: ["Clérigo"], circulo: 2, tipo: "cura", efeito: "2d8+3", alcance: "distancia", descricao: "Uma prece curta que restaura as forças de um aliado." },
  { nome: "Restauração Menor", classes: ["Clérigo"], circulo: 2, tipo: "utilidade", efeito: "", alcance: "corpo", descricao: "Tira um veneno, uma doença ou uma paralisia." },
  { nome: "Espíritos Guardiões", classes: ["Clérigo"], circulo: 3, tipo: "dano", efeito: "3d8+2d6", alcance: "corpo", descricao: "Espíritos protetores ferem quem chega perto." },
  { nome: "Revivificar", classes: ["Clérigo"], circulo: 3, tipo: "cura", efeito: "4d8+4", alcance: "corpo", descricao: "Traz de volta quem acabou de cair." },
  { nome: "Guardião da Fé", classes: ["Clérigo"], circulo: 4, tipo: "dano", efeito: "6d10", alcance: "distancia", descricao: "Um guardião espectral golpeia o inimigo." },
  { nome: "Curar Ferimentos Graves", classes: ["Clérigo"], circulo: 4, tipo: "cura", efeito: "4d8+6", alcance: "corpo", descricao: "Uma luz intensa que fecha feridas profundas." },
  { nome: "Coluna de Chamas", classes: ["Clérigo"], circulo: 5, tipo: "dano", efeito: "8d8", alcance: "distancia", descricao: "Uma coluna de fogo sagrado desce do céu." },
  { nome: "Cura Divina", classes: ["Clérigo"], circulo: 5, tipo: "cura", efeito: "6d8+8", alcance: "distancia", descricao: "Uma onda de luz que restaura quase toda a vida de um aliado." },
];

const TECNICAS = [
  // ── Guerreiro (Força) ──
  { nome: "Golpe poderoso", classe: "Guerreiro", nivelMinimo: 2, atributo: "for", dano: "1d10", bonusExtra: 0, alcance: "corpo", descricao: "Um golpe com todo o peso do corpo." },
  { nome: "Arremesso de lança", classe: "Guerreiro", nivelMinimo: 2, atributo: "for", dano: "1d8", bonusExtra: 0, alcance: "distancia", descricao: "Arremessa uma arma com força e precisão." },
  { nome: "Investida", classe: "Guerreiro", nivelMinimo: 3, atributo: "for", dano: "1d8+2", bonusExtra: 1, alcance: "corpo", descricao: "Avança e golpeia com o impulso da corrida." },
  { nome: "Golpe giratório", classe: "Guerreiro", nivelMinimo: 5, atributo: "for", dano: "2d8", bonusExtra: 0, alcance: "corpo", descricao: "Um giro amplo que acerta com força redobrada." },
  { nome: "Golpe esmagador", classe: "Guerreiro", nivelMinimo: 7, atributo: "for", dano: "2d10+2", bonusExtra: 0, alcance: "corpo", descricao: "Um golpe que quebra escudos e ossos." },
  { nome: "Fúria do campeão", classe: "Guerreiro", nivelMinimo: 11, atributo: "for", dano: "3d10+2", bonusExtra: 1, alcance: "corpo", descricao: "Uma sequência de golpes de quem já venceu mil lutas." },
  { nome: "Golpe devastador", classe: "Guerreiro", nivelMinimo: 15, atributo: "for", dano: "4d10+4", bonusExtra: 2, alcance: "corpo", descricao: "Um único golpe que decide a batalha." },
  // ── Ladino (Destreza) ──
  { nome: "Ataque furtivo", classe: "Ladino", nivelMinimo: 2, atributo: "des", dano: "1d6+2d6", bonusExtra: 0, alcance: "corpo", descricao: "Arma leve no ponto fraco, quando o alvo se distrai." },
  { nome: "Tiro furtivo", classe: "Ladino", nivelMinimo: 3, atributo: "des", dano: "1d6+2d6", bonusExtra: 0, alcance: "distancia", descricao: "Um disparo certeiro das sombras." },
  { nome: "Golpe nas costas", classe: "Ladino", nivelMinimo: 5, atributo: "des", dano: "1d6+4d6", bonusExtra: 0, alcance: "corpo", descricao: "Aparece atrás do alvo e golpeia onde dói mais." },
  { nome: "Disparo preciso", classe: "Ladino", nivelMinimo: 7, atributo: "des", dano: "1d8+4d6", bonusExtra: 2, alcance: "distancia", descricao: "Mira com calma e acerta a fresta da armadura." },
  { nome: "Golpe mortal", classe: "Ladino", nivelMinimo: 11, atributo: "des", dano: "1d6+6d6", bonusExtra: 1, alcance: "corpo", descricao: "Um golpe silencioso que derruba quase qualquer um." },
  { nome: "Lâmina na sombra", classe: "Ladino", nivelMinimo: 15, atributo: "des", dano: "1d6+8d6", bonusExtra: 2, alcance: "corpo", descricao: "Some na sombra e reaparece com a lâmina no alvo." },
];

/** Compara nomes sem diferenciar maiúsculas, acentos e espaços extras (igual a regras.chave). */
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const custoDe = (circulo) => (circulo > 0 ? circulo + 1 : 0);

/** Expressão do truque de dano no nível (mais um dado nos níveis 5, 11 e 17). */
function efeitoNoNivel(m, nivel) {
  if (!m.escala) return m.efeito;
  const vezes = 1 + (nivel >= 5) + (nivel >= 11) + (nivel >= 17);
  return m.efeito.replace(/^(\d+)d/, (_, n) => `${Number(n) * vezes}d`);
}

function magiaDoCatalogo(nome) {
  const k = chave(nome);
  return k ? MAGIAS.find((m) => chave(m.nome) === k) || null : null;
}
function tecnicaDoCatalogo(nome) {
  const k = chave(nome);
  return k ? TECNICAS.find((t) => chave(t.nome) === k) || null : null;
}

/** A magia como fica na ficha (formato do contrato), no nível do personagem. */
function magiaParaFicha(m, nivel = 1, descricao = "") {
  return { nome: m.nome, circulo: m.circulo, tipo: m.tipo, efeito: efeitoNoNivel(m, nivel), alcance: m.alcance, custo: custoDe(m.circulo), descricao: descricao || m.descricao };
}

const magiasDaClasse = (classe, circuloMax) => MAGIAS.filter((m) => m.classes.includes(classe) && m.circulo <= circuloMax);
const tecnicasDaClasse = (classe, nivel) => TECNICAS.filter((t) => t.classe === classe && t.nivelMinimo <= nivel);

module.exports = { MAGIAS, TECNICAS, custoDe, efeitoNoNivel, magiaDoCatalogo, tecnicaDoCatalogo, magiaParaFicha, magiasDaClasse, tecnicasDaClasse };
