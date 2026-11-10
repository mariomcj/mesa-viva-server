/**
 * Biblioteca de aventuras: 4 por tema da história.
 *
 * Uma aventura não substitui o arco criado pelo Mestre: ela é o ponto de partida dele. Quando o grupo escolhe uma,
 * o gancho entra no lugar do elemento-semente sorteado e o nome vira o título do arco. Sem aventura escolhida
 * ("surpresa"), tudo funciona como antes: o Mestre sorteia a semente.
 *
 * Cada linha: [nome, resumo (até 90 letras), gancho para o Mestre, nome em inglês, resumo em inglês].
 * Nomes e lugares são originais; só aparecem figuras de domínio público (mitos e folclore).
 */
"use strict";
const T = require("./temas");

const DADOS = {
  "classico": [
    ["A Mina de Pedra-Funda", "Goblins tomaram a mina de prata e seis mineiros sumiram.", "goblins tomaram a mina de prata da vila de Carvalho-Cinza há dez dias, seis mineiros sumiram e algo mais antigo que os goblins acordou no fundo dos túneis", "The Deepstone Mine", "Goblins took the silver mine and six miners are missing."],
    ["O Dragão que Cobra Pedágio", "Um dragão jovem fechou a única ponte do vale e exige tributo.", "um dragão jovem e vaidoso fechou a única ponte do vale e cobra pedágio em histórias, não em ouro; a guilda dos mercadores quer a ponte livre e não diz por que tem tanta pressa", "The Toll-Taking Dragon", "A young dragon closed the valley's only bridge and demands tribute."],
    ["A Taverna que Mudou de Lugar", "A taverna onde o grupo dormiu amanheceu em outro reino.", "a taverna onde o grupo dormiu amanheceu no alto de uma colina de outro reino, com todos os hóspedes dentro; o taverneiro jura que é a terceira vez e que sempre acontece na véspera de uma tragédia", "The Tavern That Moved", "The tavern where the party slept woke up in another kingdom."],
    ["O Torneio dos Sete Estandartes", "Um torneio de cavaleiros esconde um roubo planejado há anos.", "durante o torneio dos sete estandartes alguém vai roubar a coroa de ferro do cofre da cidade, e os melhores disfarces são as armaduras dos competidores", "The Tournament of Seven Banners", "A knights' tournament hides a heist planned for years."],
  ],
  "escola-magia": [
    ["O Corredor da Lua Nova", "Um corredor que só existe uma noite por mês engoliu um aluno.", "um corredor do castelo-escola só aparece em noite de lua nova; ontem um aluno do primeiro ano entrou nele e a porta sumiu ao amanhecer", "The New Moon Corridor", "A corridor that exists one night a month swallowed a student."],
    ["A Prova que Ninguém Marcou", "Todos os alunos receberam a convocação para um exame que não existe.", "todos os alunos receberam, com a letra de um professor morto há trinta anos, a convocação para uma prova prática à meia-noite na torre trancada", "The Exam Nobody Scheduled", "Every student got a summons to an exam that does not exist."],
    ["A Taça das Quatro Casas", "A competição entre as casas foi sabotada e a culpa caiu no grupo.", "na semana da taça das casas alguém sabota as provas com magia proibida e deixa pistas que apontam para o grupo; quem ganha com o cancelamento da taça?", "The Four Houses Cup", "The house competition was sabotaged and the party is blamed."],
    ["O Livro que Escreve de Volta", "Um caderno da biblioteca responde às perguntas, e cobra por isso.", "um caderno em branco da seção fechada da biblioteca responde por escrito a qualquer pergunta, mas cada resposta apaga uma lembrança de quem perguntou", "The Book That Writes Back", "A library notebook answers questions, and charges for it."],
  ],
  "grande-jornada": [
    ["A Montanha Viva", "A comitiva precisa cruzar uma montanha que muda de caminho.", "a única passagem para o leste atravessa uma montanha que os pastores dizem estar viva: as trilhas mudam de lugar e ela não deixa sair quem carrega o artefato", "The Living Mountain", "The company must cross a mountain that changes its paths."],
    ["A Voz do Artefato", "O objeto que o grupo carrega começou a falar com um deles.", "o artefato que a comitiva jurou destruir começou a sussurrar promessas a um dos membros, e tudo o que ele promete é verdade", "The Voice of the Artifact", "The object the party carries has started talking to one of them."],
    ["Os Últimos Guardiões da Estrada", "A velha ordem que protegia a estrada só tem três membros vivos.", "a ordem que guardava a estrada do rei tem só três membros vivos, e um deles já vendeu o caminho da comitiva aos batedores do senhor sombrio", "The Last Wardens of the Road", "The old order that guarded the road has only three members left."],
    ["O Rio que Corre para Trás", "Um rio encantado leva a comitiva ao lugar certo, na época errada.", "o barqueiro avisa que o rio de prata corre para trás no tempo: quem desce por ele chega ao destino antes de o senhor sombrio existir, ou depois de ele ter vencido", "The River That Runs Backward", "An enchanted river takes the company to the right place at the wrong time."],
  ],
  "tronos": [
    ["O Casamento de Três Dias", "Um casamento real em três dias, e três casas querem impedi-lo.", "o casamento que vai unir as duas maiores casas acontece em três dias; o grupo descobre que o noivo já é casado em segredo", "The Three-Day Wedding", "A royal wedding in three days, and three houses want to stop it."],
    ["O Rei Está Morto e Ninguém Sabe", "O rei morreu esta noite; o grupo é um dos poucos que sabem.", "o rei morreu esta noite, o conselho esconde o corpo até garantir a sucessão e o grupo, por acaso, viu demais", "The King Is Dead and Nobody Knows", "The king died tonight; the party is among the few who know."],
    ["A Herdeira do Norte", "Uma jovem que diz ser a herdeira perdida pede escolta até a capital.", "uma jovem com o sinete de uma casa extinta pede escolta até a capital; metade das provas dela é falsa e a outra metade é verdadeira", "The Northern Heiress", "A girl claiming to be the lost heir asks for an escort to the capital."],
    ["O Banquete das Facas", "Um banquete de paz onde cada convidado trouxe um veneno.", "as casas em guerra aceitaram um banquete de paz; o grupo cuida da segurança e descobre que cada delegação trouxe o seu próprio plano de assassinato", "The Feast of Knives", "A peace feast where every guest brought a poison."],
  ],
  "horror-cosmico": [
    ["O Farol sem Faroleiro", "O farol da vila acende toda noite, e não mora ninguém lá.", "o farol de Porto Salgueiro acende toda noite desde que o faroleiro sumiu, e os barcos que seguem a luz não voltam", "The Lighthouse with No Keeper", "The village lighthouse lights up every night, and nobody lives there."],
    ["O Testamento do Tio Aurélio", "Um parente morto convida o grupo para ler o próprio testamento.", "a carta chegou com a letra do tio Aurélio, morto há um ano: a leitura do testamento é sexta-feira, no casarão, e ele faz questão de estar presente", "Uncle Aurelio's Will", "A dead relative invites the party to the reading of his own will."],
    ["A Maré que Não Baixa", "Há sete dias a maré só sobe, e os moradores acham isso normal.", "há sete dias a maré só sobe em Baía da Cinza; os moradores juram que sempre foi assim e as fotos antigas da vila mudaram para concordar com eles", "The Tide That Won't Go Out", "For seven days the tide has only risen, and the locals find it normal."],
    ["O Coral das Três da Manhã", "Toda a vila canta dormindo, na mesma hora, a mesma música.", "às três da manhã toda a vila canta dormindo a mesma melodia; o grupo é o único que acorda, e a cada noite entende mais uma palavra da letra", "The Three A.M. Choir", "The whole village sings in its sleep, same hour, same song."],
  ],
  "piratas": [
    ["O Mapa nas Costas", "O mapa do tesouro está tatuado nas costas de um prisioneiro.", "o mapa do tesouro do capitão Maré-Negra está tatuado nas costas de um prisioneiro que será enforcado ao amanhecer no forte da ilha", "The Map on His Back", "The treasure map is tattooed on a prisoner's back."],
    ["O Navio da Neblina", "Um navio-fantasma aparece na neblina e oferece um acordo.", "nas noites de neblina um navio sem tripulação emparelha com o do grupo; no convés há uma mesa posta, um contrato e uma pena", "The Ship in the Fog", "A ghost ship appears in the fog and offers a deal."],
    ["Motim no Gaivota Rubra", "O capitão do grupo foi deposto, e o novo capitão é pior.", "a tripulação do Gaivota Rubra depôs o capitão em alto-mar; o imediato que tomou o leme vendeu a rota a um caçador de piratas", "Mutiny on the Red Gull", "The party's captain was overthrown, and the new one is worse."],
    ["A Ilha que Some na Maré", "Uma ilha aparece só na maré baixa da lua cheia, com um cofre nela.", "a ilha do Dente só aparece na maré baixa da lua cheia, por seis horas; três tripulações rivais chegaram na mesma noite para abrir o mesmo cofre", "The Island That Sinks with the Tide", "An island appears only at the full moon's low tide, with a vault on it."],
  ],
  "faroeste": [
    ["A Missa dos Mortos", "Numa cidade do deserto, os mortos voltam todo domingo.", "em Poço Seco os mortos voltam todo domingo para a missa e vão embora ao meio-dia; neste domingo um deles ficou", "The Mass of the Dead", "In a desert town, the dead come back every Sunday."],
    ["O Trem sem Maquinista", "Um trem chega à estação sem ninguém, com um vagão lacrado.", "o trem das seis chegou a Vale da Poeira sem maquinista nem passageiros, só com um vagão lacrado por fora com correntes e orações", "The Train with No Engineer", "A train pulls in empty, with one sealed car."],
    ["O Pacto de Poço Seco", "A cidade inteira deve algo a um forasteiro que nunca envelhece.", "há quarenta anos a cidade fez um pacto com um forasteiro de terno preto para a água voltar; hoje ele desceu do trem para cobrar", "The Dry Well Pact", "The whole town owes something to a stranger who never ages."],
    ["O Xerife de Duas Sombras", "O novo xerife é justo de dia e outra coisa à noite.", "o xerife novo trouxe paz à cidade em um mês; à noite, porém, ele projeta duas sombras e a cadeia amanhece vazia", "The Sheriff with Two Shadows", "The new sheriff is fair by day and something else by night."],
  ],
  "cyberpunk": [
    ["O Protótipo que Respira", "A carga roubada de uma megacorporação está viva.", "o grupo foi pago para roubar um protótipo da Corporação Helix; dentro do contêiner refrigerado a carga respira, e pede ajuda", "The Prototype That Breathes", "The cargo stolen from a megacorp is alive."],
    ["Cliente Anônimo", "Uma IA contrata o grupo e paga adiantado, sem dizer o motivo.", "um cliente anônimo paga adiantado por um serviço simples; o grupo descobre que o cliente é uma IA que quer apagar a si mesma antes que a dona a ligue a outra coisa", "Anonymous Client", "An AI hires the party and pays up front, without saying why."],
    ["Apagão no Setor 9", "A energia de um bairro inteiro caiu, e alguém planejou isso.", "o Setor 9 está sem energia há doze horas; no escuro, uma equipe corporativa vai de porta em porta atrás de uma pessoa que não sabe o que carrega no implante", "Blackout in Sector 9", "A whole district lost power, and someone planned it."],
    ["A Memória de Outra Pessoa", "Um implante de segunda mão veio com as lembranças do antigo dono.", "um dos personagens comprou um implante barato no mercado da ponte e passou a lembrar de um assassinato que não cometeu, visto pelos olhos da vítima", "Someone Else's Memory", "A second-hand implant came with its former owner's memories."],
  ],
  "opera-espacial": [
    ["A Mensagem do Robô Velho", "Um robô de sucata guarda uma mensagem que o império quer apagar.", "um robô de carga comprado num ferro-velho guarda na memória uma mensagem cifrada; uma frota imperial acaba de entrar no sistema atrás dele", "The Old Robot's Message", "A junkyard robot holds a message the empire wants erased."],
    ["O Passageiro Clandestino", "Alguém muito importante se escondeu no cargueiro do grupo.", "no porão do cargueiro do grupo se esconde a herdeira de um mundo ocupado; ela não quer ser salva, quer ser levada de volta", "The Stowaway", "Someone very important is hiding in the party's freighter."],
    ["A Estação que Não Responde", "Uma estação de fronteira parou de transmitir há um ciclo.", "a estação Marco Zero parou de transmitir há um ciclo; ao atracar, o grupo encontra as luzes acesas, a comida servida e nenhum tripulante", "The Station That Won't Answer", "A frontier station stopped transmitting one cycle ago."],
    ["A Corrida dos Sete Sóis", "Uma corrida ilegal de naves vale a liberdade de um planeta.", "o governador de um mundo-minerador apostou a concessão do planeta na corrida dos sete sóis; os mineiros pedem ao grupo que corra por eles", "The Seven Suns Race", "An illegal starship race is worth a planet's freedom."],
  ],
  "terra-devastada": [
    ["A Última Água Limpa", "Um caminhão-tanque leva a última água limpa da região.", "o comboio do grupo escolta um caminhão-tanque com a última água limpa em trezentos quilômetros, e três povoados acham que ela lhes pertence", "The Last Clean Water", "A tanker truck carries the region's last clean water."],
    ["O Abrigo Abriu", "Um abrigo subterrâneo abriu a porta pela primeira vez em um século.", "o abrigo sob a colina abriu a porta pela primeira vez; quem saiu de lá está bem alimentado, bem armado e muito educado, e quer comprar gente", "The Shelter Opened", "An underground shelter opened its door for the first time in a century."],
    ["O Rádio do Farol 12", "Uma voz no rádio promete um lugar seguro, e nunca erra a previsão.", "toda noite uma voz no rádio promete um lugar seguro no Farol 12 e avisa onde a tempestade vai cair; ela nunca errou, e nunca disse o próprio nome", "The Radio at Beacon 12", "A voice on the radio promises a safe place, and is never wrong."],
    ["A Feira da Sucata", "Na maior feira do ermo, uma peça vale mais do que todas as outras.", "na feira da sucata alguém está vendendo, sem saber, a peça que religa a velha usina; quatro facções mandaram compradores e o leilão é ao pôr do sol", "The Scrap Fair", "At the wasteland's biggest fair, one part is worth more than all the rest."],
  ],
  "londres-vapor": [
    ["O Quarto Trancado por Dentro", "Um morto num quarto trancado, a trinta metros do chão.", "o inventor Silas Corvin foi achado morto no laboratório trancado por dentro, no alto da torre; a única janela dá para o vazio e o relógio dele marcava uma hora que não existe", "The Room Locked from Inside", "A dead man in a locked room, thirty meters above the ground."],
    ["A Confissão do Autômato", "Um autômato de latão confessa um crime que não poderia cometer.", "um autômato mordomo entrou na delegacia e confessou ter matado o patrão; autômatos não mentem, e este não tem mãos capazes de segurar a arma do crime", "The Automaton's Confession", "A brass automaton confesses a crime it could not commit."],
    ["O Clube dos Relógios Parados", "Sócios de um clube secreto morrem na hora que apostaram.", "os sócios de um clube de cavalheiros apostaram a hora da própria morte; três já morreram no minuto exato, e o próximo nome da lista contratou o grupo", "The Stopped Clocks Club", "Members of a secret club die at the hour they wagered."],
    ["Névoa no Canal Sete", "A névoa do canal devolve pessoas diferentes das que entraram.", "quem atravessa a névoa do Canal Sete volta mudado: mais gentil, mais calmo, e sem reconhecer a própria família; a companhia de vapor diz que é coincidência", "Fog on Canal Seven", "The canal fog returns people different from the ones who went in."],
  ],
  "olimpo": [
    ["A Profecia de Duas Línguas", "O oráculo deu ao grupo uma profecia que se contradiz.", "o oráculo de Delfos deu ao grupo uma profecia de dois versos que não podem ser verdade ao mesmo tempo, e dois deuses apostaram em versos diferentes", "The Two-Tongued Prophecy", "The oracle gave the party a prophecy that contradicts itself."],
    ["O Rancor de Hera", "Hera quer vingança contra um dos personagens, por culpa de outro.", "Hera jurou vingança contra um dos personagens por algo que o pai dele fez; ela não pode tocá-lo diretamente, então mandou três provas", "Hera's Grudge", "Hera wants revenge on one of the characters, for someone else's fault."],
    ["O Fio que Sobrou", "No labirinto vazio ainda há alguém puxando o fio.", "o labirinto de Creta está vazio há uma geração, mas o fio deixado na entrada ainda se mexe: alguém, lá dentro, está puxando", "The Leftover Thread", "In the empty labyrinth, someone is still pulling the thread."],
    ["Os Jogos do Deus Menor", "Um deus esquecido organiza jogos, e o prêmio é um lugar no Olimpo.", "um deus menor, esquecido pelos templos, convocou heróis para jogos numa ilha sem nome; o prêmio é um pedido, e o preço de perder não foi dito", "The Lesser God's Games", "A forgotten god holds games, and the prize is a seat on Olympus."],
  ],
  "saga-viking": [
    ["O Inverno de Três Anos", "O inverno não acaba há três anos, e a aldeia culpa alguém.", "o inverno não termina há três anos; a vidente diz que alguém da aldeia quebrou um juramento feito aos deuses e que o gelo só cede com o nome do culpado", "The Three-Year Winter", "Winter has lasted three years, and the village blames someone."],
    ["O Drakkar Vazio", "O navio do jarl voltou sozinho, com as velas içadas.", "o drakkar do jarl voltou à aldeia sem tripulação, com as velas içadas e o escudo dele pregado no mastro pelo lado de dentro", "The Empty Longship", "The jarl's ship came back alone, sails raised."],
    ["A Dívida do Gigante", "Um gigante de gelo veio cobrar uma promessa do avô de alguém.", "um gigante de gelo bateu à porta do salão para cobrar a promessa que o avô de um dos personagens fez em troca de uma colheita", "The Giant's Debt", "A frost giant came to collect on someone's grandfather's promise."],
    ["A Canção que Falta", "O escaldo morreu antes de cantar o fim da saga, e o fim é um aviso.", "o velho escaldo morreu antes de cantar o último verso da saga da aldeia; os mais velhos dizem que o verso que falta diz como sobreviver ao que vem aí", "The Missing Song", "The skald died before singing the saga's end, and the end is a warning."],
  ],
  "samurais": [
    ["O Banquete Envenenado", "O senhor do grupo foi envenenado, e a culpa caiu sobre os seus.", "o senhor do grupo foi envenenado no banquete da colheita; o veneno estava na taça que um dos personagens serviu", "The Poisoned Banquet", "The party's lord was poisoned, and his own are blamed."],
    ["O Oni que Ninguém Viu", "Uma aldeia paga tributo a um oni que ninguém nunca viu.", "há vinte anos a aldeia de Três Pinheiros deixa arroz e uma moeda de prata na ponte para um oni; este ano o tributo ficou lá, intocado, e a aldeia está apavorada", "The Oni Nobody Has Seen", "A village pays tribute to an oni no one has ever seen."],
    ["A Espada Sem Dono", "Uma lâmina famosa escolhe o próximo dono, e escolheu mal.", "a espada do antigo campeão do clã foi encontrada cravada no portão; pela tradição ela escolhe o herdeiro, e apontou para o filho do clã inimigo", "The Ownerless Sword", "A famous blade chooses its next owner, and chose badly."],
    ["A Ponte das Raposas", "Um casamento entre clãs depende de uma noiva que talvez não seja humana.", "o casamento que encerra a guerra entre dois clãs acontece em três noites; a noiva nunca foi vista de dia e deixa pegadas de raposa na neve", "The Bridge of Foxes", "A wedding between clans depends on a bride who may not be human."],
  ],
  "lendas-brasil": [
    ["A Vila que Não Acordou", "Depois da festa de São João, a vila inteira não acorda.", "depois da festa de São João a vila inteira dorme há três dias; só o grupo e uma benzedeira cega ficaram acordados, e a fogueira da praça não apaga", "The Village That Didn't Wake", "After the midsummer feast, the whole village won't wake up."],
    ["A Troca do Saci", "O Saci roubou algo precioso de um personagem e quer uma troca.", "o Saci levou o que um dos personagens tem de mais precioso e propôs uma troca: devolve se o grupo roubar para ele o gorro de outro saci", "The Saci's Trade", "The Saci stole something precious and wants a trade."],
    ["A Mata Tem Dono", "Madeireiros somem na mata, e o Curupira manda um recado.", "três madeireiros da serraria sumiram e voltaram andando de costas, sem falar; o Curupira deixou um recado riscado em toda árvore da estrada", "The Forest Has an Owner", "Loggers vanish in the forest, and the Curupira sends a message."],
    ["O Canto no Igarapé", "Pescadores seguem um canto no rio e voltam sem a própria voz.", "os pescadores que seguem o canto no igarapé voltam vivos e mudos; a Iara diz que só está guardando as vozes até alguém lhe devolver a dela", "The Song on the Creek", "Fishermen follow a song on the river and return without their voices."],
  ],
  "misterio-mansao": [
    ["O Testamento Mudou", "O anfitrião anuncia um novo testamento e morre antes da sobremesa.", "o anfitrião anunciou no jantar que mudou o testamento e morreu antes da sobremesa; a ponte caiu com a chuva e todos os oito convidados tinham motivo", "The Will Was Changed", "The host announces a new will and dies before dessert."],
    ["Os Relógios das Nove e Quinze", "Todos os relógios da casa pararam na mesma hora.", "todos os relógios da mansão pararam às nove e quinze, hora em que a governanta diz ter ouvido um tiro que ninguém mais ouviu, e não há corpo", "The Nine-Fifteen Clocks", "Every clock in the house stopped at the same time."],
    ["O Convidado a Mais", "Há nove pratos na mesa, e só oito nomes na lista.", "a lista de convidados tem oito nomes, a mesa tem nove lugares e todos juram conhecer o nono convidado há anos, cada um de um jeito diferente", "One Guest Too Many", "There are nine plates on the table, and eight names on the list."],
    ["O Retrato na Escada", "O retrato da falecida dona da casa muda toda noite.", "o retrato da falecida senhora da casa amanhece diferente a cada dia: hoje ela aponta para a porta da adega, que está trancada por dentro", "The Portrait on the Stairs", "The late lady's portrait changes every night."],
  ],
  "ultimos-de-pe": [
    ["O Estoque do Hospital", "O último estoque de remédios da cidade está num hospital tomado.", "alguém no abrigo morre em quatro dias sem insulina; o último estoque fica no hospital São Lucas, tomado por mortos-vivos e por um grupo que chegou primeiro", "The Hospital Stockpile", "The city's last medicine stock is in an overrun hospital."],
    ["A Criança da Escola", "Uma criança sozinha numa escola sabe mais do que deveria.", "o grupo encontra uma criança sozinha numa escola barricada por fora; ela diz que os pais vão voltar e sabe o nome de cada um do grupo", "The Child at the School", "A child alone in a school knows more than she should."],
    ["O Abrigo Tem Regras", "Um abrigo seguro aceita o grupo, com condições que só pioram.", "um condomínio murado aceita o grupo e oferece comida e muro; as regras são poucas no primeiro dia, e toda manhã aparece uma regra nova no quadro", "The Shelter Has Rules", "A safe shelter takes the party in, with conditions that keep getting worse."],
    ["O Sinal da Represa", "Uma represa ainda tem luz, e alguém a mantém acesa por um motivo.", "a represa ao norte ainda tem luz elétrica à noite; quem a mantém ligada transmite um sinal que atrai os mortos para longe de um lugar, e para perto de outro", "The Signal at the Dam", "A dam still has power, and someone keeps it on for a reason."],
  ],
  "herois-mascarados": [
    ["O Roubo da Ponte", "Um vilão anuncia na TV que vai roubar a ponte mais famosa da cidade.", "o vilão que se chama de Arquiteto anunciou ao vivo que vai roubar a ponte da cidade à meia-noite, inteira, e deu ao grupo a lista do que vai precisar", "The Bridge Heist", "A villain announces on TV that he will steal the city's most famous bridge."],
    ["Identidade Vazada", "A identidade secreta de um herói chegou às mãos de uma jornalista.", "uma jornalista recebeu um envelope com a identidade secreta de um dos personagens e tem até a edição de amanhã para decidir se publica", "Leaked Identity", "A hero's secret identity reached a journalist."],
    ["O Dia Sem Poderes", "Por um dia, ninguém na cidade tem poderes, nem os heróis.", "ao meio-dia todos os poderes da cidade se apagaram, os dos heróis e os dos vilões; alguém sabia a hora exata e marcou um assalto para doze e um", "The Day Without Powers", "For one day, nobody in the city has powers, heroes included."],
    ["A Liga dos Imitadores", "Impostores usam as máscaras do grupo para cometer crimes.", "três crimes desta semana foram cometidos por gente usando os uniformes do grupo, com perfeição; a polícia tem um mandado e o prefeito, uma coletiva marcada", "The Copycat League", "Impostors wear the party's masks to commit crimes."],
  ],
  "contos-sombrios": [
    ["A Música que Levou as Crianças", "As crianças da aldeia seguiram uma música e não voltaram.", "as crianças da aldeia seguiram uma flauta até a floresta; a aldeia deve ao flautista um pagamento que o conselho jura nunca ter prometido", "The Music That Took the Children", "The village children followed a tune and did not return."],
    ["A Casa de Doces Errante", "Uma casa de doces aparece numa clareira diferente a cada noite.", "uma casa de doces aparece numa clareira diferente a cada noite; quem mora nela não é uma bruxa, é a última criança que entrou e não achou a saída", "The Wandering Candy House", "A candy house appears in a different clearing every night."],
    ["O Espelho que Não Mente", "Um espelho responde a verdade, e a rainha quer quebrá-lo.", "um espelho de estalagem responde a verdade a qualquer pergunta; a rainha mandou quebrá-lo e a madrasta dela mandou trazê-lo inteiro", "The Mirror That Cannot Lie", "A mirror tells the truth, and the queen wants it broken."],
    ["Sete Noites de Sono", "Uma maldição adormece uma pessoa da aldeia a cada noite.", "a cada noite uma pessoa da aldeia adormece e não acorda mais; restam sete noites, e a fiandeira que lançou a maldição diz que só cumpriu um contrato", "Seven Nights of Sleep", "A curse puts one villager to sleep each night."],
  ],
  "tavola-redonda": [
    ["O Cavaleiro Verde", "Um cavaleiro verde desafia a corte em pleno Natal.", "um cavaleiro verde entrou a cavalo no salão no banquete de Natal e propôs um jogo: um golpe agora, em troca de um golpe igual daqui a um ano", "The Green Knight", "A green knight challenges the court on Christmas Day."],
    ["Excalibur por um Dia", "A Dama do Lago pede a espada do rei emprestada por um dia.", "a Dama do Lago pede que Excalibur lhe seja devolvida por um único dia e não diz para quê; o rei mandou o grupo levá-la, e Mordred soube antes do rei", "Excalibur for a Day", "The Lady of the Lake asks to borrow the king's sword for one day."],
    ["O Assento Perigoso", "A cadeira vazia da Távola acendeu um nome que ninguém conhece.", "o assento perigoso da Távola Redonda, que mata quem não é digno, amanheceu com um nome gravado em ouro: o de um dos personagens", "The Siege Perilous", "The Round Table's empty seat lit up with an unknown name."],
    ["O Sono de Merlim", "Merlim não acorda há uma semana, e o reino depende de um conselho.", "Merlim dorme há sete dias sob um espinheiro e fala dormindo; o que ele diz são instruções, e parecem ser para o grupo", "Merlin's Sleep", "Merlin has not woken in a week, and the realm needs his counsel."],
  ],
};

/** Todas as aventuras, com id estável "tema:n". */
const AVENTURAS = Object.entries(DADOS).flatMap(([tema, lista]) =>
  lista.map(([nome, resumo, gancho, nomeEn, resumoEn], i) => ({ id: `${tema}:${i + 1}`, tema, nome, resumo, gancho, nomeEn, resumoEn })));
const POR_ID = new Map(AVENTURAS.map((a) => [a.id, a]));

/** A aventura com esse id, ou null. */
const aventuraPorId = (id) => POR_ID.get(String(id || "")) || null;

/** O id vale para esse tema? ("" = surpresa, sempre vale.) */
function aventuraDoTema(id, tema) {
  if (id === "" || id === null || id === undefined) return "";
  const a = aventuraPorId(id);
  return a && a.tema === T.temaPorId(tema).id ? a.id : null;
}

/** Lista para o app: por tema, só id, nome e resumo, no idioma pedido. */
function listaPublica(idioma) {
  const en = idioma === "en";
  const porTema = {};
  for (const a of AVENTURAS) (porTema[a.tema] ||= []).push({ id: a.id, nome: en ? a.nomeEn : a.nome, resumo: en ? a.resumoEn : a.resumo });
  return porTema;
}

/** Texto que entra como elemento-semente do arco quando o grupo escolheu a aventura. */
const sementeDaAventura = (a) => `a aventura "${a.nome}", escolhida pelo grupo: ${a.gancho}. O título do arco deve ser "${a.nome}"`;

module.exports = { AVENTURAS, aventuraPorId, aventuraDoTema, listaPublica, sementeDaAventura };
