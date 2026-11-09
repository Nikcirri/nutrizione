// Alimenti di base inclusi nell'app, per 100 g (o 100 ml) di parte edibile.
// Valori medi indicativi, arrotondati, ricavati dalle comuni tabelle di composizione degli alimenti
// (carboidrati disponibili, cioè senza le fibre, come nelle etichette europee).
// Per i prodotti confezionati sono più precisi i valori in etichetta (scanner o ricerca online).
import type { Food, Portion, Unit } from '../types';

interface Extra {
  fiber?: number;
  sugar?: number;
  salt?: number;
  unit?: Unit;
  portions?: [string, number][];
  aliases?: string[];
}

const UPDATED = '2026-11-09T00:00:00.000Z';

function f(id: string, name: string, kcal: number, carbs: number, protein: number, fat: number, extra: Extra = {}): Food {
  const unit = extra.unit ?? 'g';
  const portions: Portion[] = (extra.portions ?? []).map(([label, grams]) => ({ label, grams }));
  const food: Food = {
    id: `base:${id}`,
    name,
    source: 'base',
    unit,
    per100: { kcal, carbs, protein, fat },
    portions,
    updatedAt: UPDATED,
  };
  if (extra.fiber !== undefined) food.per100.fiber = extra.fiber;
  if (extra.sugar !== undefined) food.per100.sugar = extra.sugar;
  if (extra.salt !== undefined) food.per100.salt = extra.salt;
  if (extra.aliases) food.aliases = extra.aliases;
  return food;
}

export const BASE_FOODS: readonly Food[] = [
  // Cereali, pane e pasta
  f('pasta', 'Pasta di semola (cruda)', 355, 71, 12.5, 1.5, { fiber: 3, sugar: 3.5, portions: [['Porzione (80 g)', 80], ['Porzione abbondante (100 g)', 100]], aliases: ['spaghetti', 'penne', 'fusilli', 'maccheroni', 'rigatoni'] }),
  f('pasta-cotta', 'Pasta di semola (cotta)', 158, 31, 5.6, 0.7, { fiber: 1.3, portions: [['Piatto (180 g)', 180]], aliases: ['spaghetti', 'penne', 'fusilli'] }),
  f('pasta-integrale', 'Pasta integrale (cruda)', 340, 64, 13, 2.5, { fiber: 8, sugar: 3, portions: [['Porzione (80 g)', 80]] }),
  f('pasta-uovo', 'Pasta all’uovo (cruda)', 370, 69, 14, 4, { fiber: 2.5, portions: [['Porzione (80 g)', 80]], aliases: ['tagliatelle', 'fettuccine', 'pappardelle'] }),
  f('riso', 'Riso bianco (crudo)', 355, 79, 7, 0.6, { fiber: 1, portions: [['Porzione (80 g)', 80]], aliases: ['risotto', 'carnaroli', 'arborio'] }),
  f('riso-cotto', 'Riso bianco (cotto)', 130, 28, 2.7, 0.3, { fiber: 0.4, portions: [['Piatto (180 g)', 180]] }),
  f('riso-integrale', 'Riso integrale (crudo)', 350, 73, 7.5, 2.5, { fiber: 3.5, portions: [['Porzione (80 g)', 80]] }),
  f('riso-basmati', 'Riso basmati (crudo)', 355, 78, 8, 0.8, { fiber: 1, portions: [['Porzione (80 g)', 80]] }),
  f('cous-cous', 'Cous cous (crudo)', 360, 72, 12.5, 1.5, { fiber: 3, portions: [['Porzione (80 g)', 80]], aliases: ['couscous'] }),
  f('farro', 'Farro (crudo)', 340, 67, 15, 2.5, { fiber: 7, portions: [['Porzione (80 g)', 80]] }),
  f('orzo', 'Orzo perlato (crudo)', 350, 74, 10, 1.2, { fiber: 9, portions: [['Porzione (80 g)', 80]] }),
  f('gnocchi', 'Gnocchi di patate', 155, 33, 4, 0.5, { fiber: 1.5, portions: [['Piatto (200 g)', 200]] }),
  f('pane', 'Pane bianco', 270, 54, 9, 1.5, { fiber: 2.5, salt: 1.3, portions: [['Fetta (30 g)', 30], ['Rosetta (60 g)', 60]], aliases: ['pagnotta', 'filone', 'baguette', 'rosetta', 'michetta'] }),
  f('pane-integrale', 'Pane integrale', 245, 45, 9.5, 2.5, { fiber: 7, salt: 1.2, portions: [['Fetta (30 g)', 30]] }),
  f('pancarre', 'Pan carrè', 285, 50, 8.5, 5, { fiber: 3, sugar: 5, salt: 1.2, portions: [['Fetta (25 g)', 25]], aliases: ['pane in cassetta', 'toast'] }),
  f('piadina', 'Piadina', 310, 50, 8, 8.5, { fiber: 2.5, salt: 1.6, portions: [['1 piadina (100 g)', 100]] }),
  f('fette-biscottate', 'Fette biscottate', 410, 74, 11.5, 7, { fiber: 3.5, sugar: 6, portions: [['1 fetta (10 g)', 10]] }),
  f('grissini', 'Grissini', 410, 70, 12, 9, { fiber: 3.5, salt: 2, portions: [['1 grissino (5 g)', 5]] }),
  f('crackers', 'Crackers salati', 430, 70, 10, 12, { fiber: 3, salt: 2, portions: [['Pacchetto (25 g)', 25]] }),
  f('pizza', 'Pizza margherita', 260, 33, 11, 9, { fiber: 2, salt: 1.5, portions: [['Pizza intera (350 g)', 350], ['Trancio (120 g)', 120]] }),
  f('focaccia', 'Focaccia', 300, 45, 7, 10, { fiber: 2, salt: 1.8, portions: [['Pezzo (80 g)', 80]] }),
  f('avena', 'Fiocchi d’avena', 375, 60, 13, 7, { fiber: 10, sugar: 1, portions: [['Porzione (40 g)', 40]], aliases: ['porridge', 'oats'] }),
  f('cornflakes', 'Corn flakes', 380, 84, 7, 1, { fiber: 3, sugar: 8, salt: 1.1, portions: [['Porzione (30 g)', 30]], aliases: ['cereali'] }),
  f('muesli', 'Muesli', 370, 64, 10, 7, { fiber: 8, sugar: 20, portions: [['Porzione (40 g)', 40]], aliases: ['cereali'] }),
  f('biscotti', 'Biscotti frollini', 460, 68, 7, 18, { fiber: 2.5, sugar: 24, portions: [['1 biscotto (10 g)', 10]] }),
  f('cornetto', 'Cornetto vuoto', 410, 50, 8, 20, { fiber: 2, sugar: 15, portions: [['1 cornetto (50 g)', 50]], aliases: ['brioche', 'croissant'] }),
  f('patate', 'Patate', 80, 18, 2, 0.1, { fiber: 2, portions: [['1 patata media (150 g)', 150]] }),
  f('patatine-fritte', 'Patatine fritte', 310, 41, 3.5, 15, { fiber: 3.5, salt: 0.8, portions: [['Porzione media (115 g)', 115]] }),
  f('polenta', 'Polenta (cotta)', 72, 15.5, 1.7, 0.3, { fiber: 0.8, portions: [['Porzione (200 g)', 200]] }),

  // Legumi
  f('ceci-secchi', 'Ceci secchi', 335, 46, 20, 6, { fiber: 13, portions: [['Porzione (50 g)', 50]] }),
  f('ceci', 'Ceci lessati', 120, 16, 7, 2.5, { fiber: 5, portions: [['Porzione (150 g)', 150]], aliases: ['ceci in scatola'] }),
  f('lenticchie-secche', 'Lenticchie secche', 325, 50, 24, 1.5, { fiber: 11, portions: [['Porzione (50 g)', 50]] }),
  f('lenticchie', 'Lenticchie lessate', 110, 13, 9, 0.5, { fiber: 7, portions: [['Porzione (150 g)', 150]] }),
  f('borlotti', 'Fagioli borlotti lessati', 100, 14, 7, 0.5, { fiber: 6, portions: [['Porzione (150 g)', 150]], aliases: ['fagioli'] }),
  f('cannellini', 'Fagioli cannellini lessati', 95, 13, 7, 0.5, { fiber: 6, portions: [['Porzione (150 g)', 150]], aliases: ['fagioli'] }),
  f('piselli', 'Piselli', 70, 9, 5, 0.5, { fiber: 5, portions: [['Porzione (150 g)', 150]] }),
  f('tofu', 'Tofu', 130, 1.5, 13, 8, { fiber: 1, portions: [['Porzione (100 g)', 100]] }),
  f('hummus', 'Hummus', 270, 11, 7.5, 21, { fiber: 5, salt: 1.2, portions: [['Cucchiaio (15 g)', 15]] }),

  // Carne e salumi
  f('pollo', 'Petto di pollo (crudo)', 110, 0, 23, 1.5, { portions: [['Porzione (150 g)', 150]], aliases: ['pollo', 'fettina di pollo'] }),
  f('pollo-arrosto', 'Pollo arrosto con pelle', 222, 0, 25, 13.5, { portions: [['Coscia (120 g)', 120]] }),
  f('tacchino', 'Petto di tacchino (crudo)', 107, 0, 24, 1.2, { portions: [['Porzione (150 g)', 150]] }),
  f('manzo', 'Manzo magro (crudo)', 122, 0, 21.5, 4, { portions: [['Bistecca (150 g)', 150]], aliases: ['bistecca', 'fettina', 'vitello'] }),
  f('macinato', 'Carne macinata di manzo (crudo)', 170, 0, 20, 10, { portions: [['Porzione (120 g)', 120]], aliases: ['ragù', 'polpette'] }),
  f('hamburger', 'Hamburger di manzo (cotto)', 250, 0, 26, 16, { portions: [['1 hamburger (100 g)', 100]] }),
  f('maiale', 'Lonza di maiale (cruda)', 143, 0, 21, 6.5, { portions: [['Fettina (120 g)', 120]], aliases: ['braciola'] }),
  f('salsiccia', 'Salsiccia di maiale (cruda)', 298, 1, 15, 26, { salt: 2, portions: [['1 salsiccia (100 g)', 100]] }),
  f('cotoletta', 'Cotoletta alla milanese', 260, 13, 18, 15, { fiber: 0.8, salt: 0.8, portions: [['1 cotoletta (150 g)', 150]], aliases: ['cotoletta impanata'] }),
  f('prosciutto-crudo', 'Prosciutto crudo', 265, 0, 26, 18, { salt: 5, portions: [['Fetta (15 g)', 15]] }),
  f('prosciutto-cotto', 'Prosciutto cotto', 155, 1, 20, 8, { salt: 2.2, portions: [['Fetta (20 g)', 20]] }),
  f('bresaola', 'Bresaola', 151, 0, 33, 2, { salt: 4, portions: [['Fetta (10 g)', 10]] }),
  f('mortadella', 'Mortadella', 315, 1, 15, 28, { salt: 2.3, portions: [['Fetta (20 g)', 20]] }),
  f('salame', 'Salame', 405, 1, 26, 33, { salt: 4.5, portions: [['Fetta (10 g)', 10]] }),
  f('wurstel', 'Würstel', 272, 2, 12, 24, { salt: 2, portions: [['1 würstel (50 g)', 50]], aliases: ['wurstel'] }),

  // Pesce
  f('salmone', 'Salmone (crudo)', 200, 0, 20, 13, { portions: [['Trancio (150 g)', 150]] }),
  f('salmone-affumicato', 'Salmone affumicato', 178, 0, 22, 10, { salt: 3, portions: [['Fetta (20 g)', 20]] }),
  f('tonno-olio', 'Tonno sott’olio (sgocciolato)', 190, 0, 25, 10, { salt: 1, portions: [['Scatoletta (52 g sgocciolato)', 52], ['Scatoletta grande (112 g)', 112]], aliases: ['tonno in scatola'] }),
  f('tonno-naturale', 'Tonno al naturale (sgocciolato)', 105, 0, 24.5, 0.8, { salt: 1, portions: [['Scatoletta (56 g)', 56]], aliases: ['tonno in scatola'] }),
  f('merluzzo', 'Merluzzo (crudo)', 78, 0, 18, 0.7, { portions: [['Filetto (150 g)', 150]], aliases: ['nasello', 'baccalà'] }),
  f('orata', 'Orata (cruda)', 120, 0, 20, 4.5, { portions: [['Filetto (150 g)', 150]], aliases: ['branzino', 'spigola'] }),
  f('gamberi', 'Gamberi (crudi)', 85, 0.5, 18.5, 1, { portions: [['Porzione (150 g)', 150]], aliases: ['gamberetti', 'mazzancolle'] }),
  f('bastoncini', 'Bastoncini di pesce', 209, 19, 13, 9, { fiber: 1, salt: 0.8, portions: [['1 bastoncino (25 g)', 25]] }),

  // Uova e latticini
  f('uovo', 'Uovo', 140, 0.7, 12.5, 9.5, { portions: [['1 uovo medio (55 g)', 55]], aliases: ['uova', 'frittata', 'uovo sodo'] }),
  f('albume', 'Albume d’uovo', 49, 0.7, 11, 0.2, { portions: [['1 albume (33 g)', 33]] }),
  f('latte-intero', 'Latte intero', 64, 4.8, 3.3, 3.6, { unit: 'ml', sugar: 4.8, portions: [['Tazza (200 ml)', 200], ['Bicchiere (250 ml)', 250]] }),
  f('latte-ps', 'Latte parzialmente scremato', 47, 4.9, 3.4, 1.6, { unit: 'ml', sugar: 4.9, portions: [['Tazza (200 ml)', 200], ['Bicchiere (250 ml)', 250]] }),
  f('latte-scremato', 'Latte scremato', 35, 5, 3.4, 0.1, { unit: 'ml', sugar: 5, portions: [['Tazza (200 ml)', 200]] }),
  f('soia', 'Bevanda di soia (senza zucchero)', 35, 1, 3.3, 1.9, { unit: 'ml', fiber: 0.5, portions: [['Tazza (200 ml)', 200]], aliases: ['latte di soia'] }),
  f('avena-drink', 'Bevanda d’avena', 44, 6.5, 1, 1.5, { unit: 'ml', fiber: 0.8, sugar: 4, portions: [['Tazza (200 ml)', 200]], aliases: ['latte di avena'] }),
  f('yogurt', 'Yogurt bianco intero', 64, 4.5, 3.5, 3.5, { sugar: 4.5, portions: [['Vasetto (125 g)', 125]] }),
  f('yogurt-greco-0', 'Yogurt greco 0%', 55, 3.5, 10, 0.2, { sugar: 3.5, portions: [['Vasetto (150 g)', 150], ['Vasetto grande (170 g)', 170]] }),
  f('yogurt-greco', 'Yogurt greco intero', 93, 3, 9, 5, { sugar: 3, portions: [['Vasetto (150 g)', 150]] }),
  f('yogurt-frutta', 'Yogurt alla frutta', 96, 15, 3.5, 2.5, { sugar: 14, portions: [['Vasetto (125 g)', 125]] }),
  f('mozzarella', 'Mozzarella', 253, 0.7, 18.7, 19.5, { salt: 0.5, portions: [['1 mozzarella (125 g)', 125]], aliases: ['fiordilatte'] }),
  f('mozzarella-light', 'Mozzarella light', 165, 1, 19, 9.5, { salt: 0.5, portions: [['1 mozzarella (125 g)', 125]] }),
  f('parmigiano', 'Parmigiano Reggiano', 392, 0, 33, 28.4, { salt: 1.6, portions: [['Cucchiaio grattugiato (10 g)', 10], ['Scaglia (20 g)', 20]], aliases: ['formaggio grattugiato'] }),
  f('grana', 'Grana Padano', 398, 0, 33, 29, { salt: 1.5, portions: [['Cucchiaio grattugiato (10 g)', 10]], aliases: ['formaggio grattugiato'] }),
  f('ricotta', 'Ricotta vaccina', 146, 3.5, 8.8, 10.9, { sugar: 3.5, portions: [['Porzione (100 g)', 100]] }),
  f('stracchino', 'Stracchino', 280, 0.5, 18.5, 22.5, { salt: 1.2, portions: [['Porzione (100 g)', 100]], aliases: ['crescenza'] }),
  f('fiocchi-latte', 'Fiocchi di latte', 104, 3.3, 12.5, 4.5, { salt: 0.7, portions: [['Vasetto (150 g)', 150]], aliases: ['cottage cheese'] }),
  f('feta', 'Feta', 265, 4, 14, 21.5, { salt: 2.5, portions: [['Porzione (50 g)', 50]] }),
  f('spalmabile', 'Formaggio spalmabile', 250, 3.5, 5.4, 24, { salt: 0.8, portions: [['Cucchiaio (20 g)', 20]] }),
  f('burro', 'Burro', 744, 0.6, 0.7, 82, { portions: [['Noce (10 g)', 10]] }),
  f('panna', 'Panna da cucina', 204, 3.5, 2.5, 20, { portions: [['Cucchiaio (15 g)', 15]] }),

  // Grassi e condimenti
  f('olio-evo', 'Olio extravergine d’oliva', 899, 0, 0, 99.9, { portions: [['Cucchiaio (10 g)', 10], ['Cucchiaino (4 g)', 4]], aliases: ['olio'] }),
  f('olio-semi', 'Olio di semi', 899, 0, 0, 99.9, { portions: [['Cucchiaio (10 g)', 10]], aliases: ['olio'] }),
  f('maionese', 'Maionese', 680, 1.5, 1.5, 75, { salt: 1.3, portions: [['Cucchiaio (15 g)', 15]] }),
  f('ketchup', 'Ketchup', 110, 25, 1.3, 0.2, { sugar: 22, salt: 1.8, portions: [['Cucchiaio (15 g)', 15]] }),
  f('passata', 'Passata di pomodoro', 32, 5.5, 1.4, 0.2, { fiber: 1.4, sugar: 4.5, portions: [['Porzione (100 g)', 100]], aliases: ['salsa di pomodoro', 'sugo'] }),
  f('pesto', 'Pesto alla genovese', 520, 5, 5, 52, { fiber: 2, salt: 2.5, portions: [['Cucchiaio (15 g)', 15]] }),

  // Frutta secca
  f('mandorle', 'Mandorle', 604, 6, 22, 52, { fiber: 12, portions: [['Manciata (30 g)', 30]] }),
  f('noci', 'Noci', 690, 7, 15, 65, { fiber: 6.5, portions: [['Manciata (30 g)', 30], ['1 noce (5 g)', 5]] }),
  f('nocciole', 'Nocciole', 657, 7, 15, 61, { fiber: 10, portions: [['Manciata (30 g)', 30]] }),
  f('arachidi', 'Arachidi tostate', 610, 12, 26, 49, { fiber: 8.5, portions: [['Manciata (30 g)', 30]], aliases: ['noccioline'] }),
  f('burro-arachidi', 'Burro di arachidi', 614, 13, 25, 50, { fiber: 6, sugar: 6, portions: [['Cucchiaio (15 g)', 15]] }),
  f('anacardi', 'Anacardi', 583, 27, 18, 44, { fiber: 3.3, portions: [['Manciata (30 g)', 30]] }),
  f('pistacchi', 'Pistacchi (sgusciati)', 580, 18, 20, 45, { fiber: 10, portions: [['Manciata (30 g)', 30]] }),

  // Frutta
  f('mela', 'Mela', 53, 11.5, 0.3, 0.2, { fiber: 2.2, sugar: 10.5, portions: [['1 mela media (150 g)', 150]] }),
  f('banana', 'Banana', 90, 20, 1.1, 0.3, { fiber: 2, sugar: 12, portions: [['1 banana media (120 g)', 120]] }),
  f('arancia', 'Arancia', 47, 9.4, 0.9, 0.1, { fiber: 2.4, sugar: 9, portions: [['1 arancia media (150 g)', 150]] }),
  f('mandarino', 'Mandarino', 50, 10.5, 0.8, 0.2, { fiber: 1.8, sugar: 10, portions: [['1 mandarino (70 g)', 70]], aliases: ['clementina'] }),
  f('pera', 'Pera', 57, 12.2, 0.4, 0.1, { fiber: 3.1, sugar: 10, portions: [['1 pera media (160 g)', 160]] }),
  f('fragole', 'Fragole', 32, 5.7, 0.7, 0.3, { fiber: 2, sugar: 4.9, portions: [['Ciotola (150 g)', 150]] }),
  f('kiwi', 'Kiwi', 61, 11.7, 1.1, 0.5, { fiber: 3, sugar: 9, portions: [['1 kiwi (75 g)', 75]] }),
  f('uva', 'Uva', 72, 16.5, 0.7, 0.2, { fiber: 0.9, sugar: 16, portions: [['Grappolo (150 g)', 150]] }),
  f('pesca', 'Pesca', 41, 8, 0.9, 0.3, { fiber: 1.5, sugar: 8, portions: [['1 pesca media (150 g)', 150]], aliases: ['nettarina', 'pesca noce'] }),
  f('ananas', 'Ananas', 52, 11.7, 0.5, 0.1, { fiber: 1.4, sugar: 10, portions: [['Fetta (100 g)', 100]] }),
  f('anguria', 'Anguria', 32, 7, 0.6, 0.2, { fiber: 0.4, sugar: 6.2, portions: [['Fetta (300 g)', 300]], aliases: ['cocomero'] }),
  f('melone', 'Melone', 35, 7.3, 0.8, 0.2, { fiber: 0.9, sugar: 7.3, portions: [['Fetta (200 g)', 200]] }),
  f('albicocche', 'Albicocche', 49, 9.1, 1.4, 0.4, { fiber: 2, sugar: 9, portions: [['1 albicocca (40 g)', 40]] }),
  f('ciliegie', 'Ciliegie', 65, 14, 1.1, 0.2, { fiber: 2.1, sugar: 12.8, portions: [['Ciotola (150 g)', 150]] }),
  f('mirtilli', 'Mirtilli', 58, 12, 0.7, 0.3, { fiber: 2.4, sugar: 10, portions: [['Vaschetta (125 g)', 125]] }),
  f('avocado', 'Avocado', 160, 1.8, 2, 14.7, { fiber: 6.7, sugar: 0.7, portions: [['Mezzo avocado (70 g)', 70]] }),

  // Verdura
  f('insalata', 'Insalata (lattuga)', 15, 1.4, 1.4, 0.2, { fiber: 1.3, portions: [['Ciotola (80 g)', 80]], aliases: ['lattuga', 'insalata verde'] }),
  f('rucola', 'Rucola', 27, 2.1, 2.6, 0.7, { fiber: 1.6, portions: [['Manciata (30 g)', 30]] }),
  f('pomodori', 'Pomodori', 18, 2.7, 0.9, 0.2, { fiber: 1.2, sugar: 2.6, portions: [['1 pomodoro (120 g)', 120]], aliases: ['pomodorini'] }),
  f('zucchine', 'Zucchine', 17, 2.1, 1.2, 0.3, { fiber: 1, sugar: 1.7, portions: [['1 zucchina (200 g)', 200]] }),
  f('carote', 'Carote', 39, 6.8, 0.9, 0.2, { fiber: 2.8, sugar: 4.7, portions: [['1 carota (80 g)', 80]] }),
  f('broccoli', 'Broccoli', 36, 4.4, 2.8, 0.4, { fiber: 2.6, sugar: 1.7, portions: [['Porzione (200 g)', 200]] }),
  f('spinaci', 'Spinaci', 24, 1.4, 2.9, 0.4, { fiber: 2.2, portions: [['Porzione (200 g)', 200]] }),
  f('peperoni', 'Peperoni', 27, 4.2, 1, 0.3, { fiber: 2.1, sugar: 4.2, portions: [['1 peperone (160 g)', 160]] }),
  f('melanzane', 'Melanzane', 24, 2.9, 1, 0.2, { fiber: 3, sugar: 3.5, portions: [['Porzione (200 g)', 200]] }),
  f('cetrioli', 'Cetrioli', 16, 3.1, 0.7, 0.1, { fiber: 0.5, sugar: 1.7, portions: [['1 cetriolo (200 g)', 200]] }),
  f('cipolle', 'Cipolle', 39, 7.6, 1.1, 0.1, { fiber: 1.7, sugar: 4.2, portions: [['1 cipolla (100 g)', 100]] }),
  f('funghi', 'Funghi champignon', 24, 2.3, 3.1, 0.3, { fiber: 1, portions: [['Porzione (150 g)', 150]] }),
  f('fagiolini', 'Fagiolini', 31, 4.3, 1.8, 0.2, { fiber: 2.7, sugar: 3.3, portions: [['Porzione (200 g)', 200]] }),
  f('cavolfiore', 'Cavolfiore', 26, 3, 1.9, 0.3, { fiber: 2, sugar: 1.9, portions: [['Porzione (200 g)', 200]] }),
  f('mais', 'Mais in scatola (sgocciolato)', 86, 15, 2.7, 1.2, { fiber: 2.5, sugar: 4, portions: [['Scatoletta (140 g)', 140]] }),
  f('minestrone', 'Minestrone di verdure', 38, 5, 1.5, 1, { fiber: 1.5, salt: 0.6, portions: [['Piatto (300 g)', 300]], aliases: ['zuppa', 'passato di verdure'] }),

  // Piatti pronti
  f('lasagne', 'Lasagne alla bolognese', 160, 13, 9, 8, { fiber: 1, salt: 0.8, portions: [['Porzione (300 g)', 300]] }),
  f('pasta-pomodoro', 'Pasta al pomodoro (piatto)', 133, 22, 4.5, 3, { fiber: 1.5, salt: 0.5, portions: [['Piatto (250 g)', 250]], aliases: ['spaghetti al pomodoro'] }),
  f('tiramisu', 'Tiramisù', 300, 30, 5, 18, { sugar: 22, portions: [['Porzione (100 g)', 100]] }),
  f('gelato', 'Gelato alla crema', 215, 25, 4, 11, { sugar: 22, portions: [['Coppetta (100 g)', 100], ['Cono (120 g)', 120]] }),

  // Dolci e snack
  f('zucchero', 'Zucchero', 400, 100, 0, 0, { sugar: 100, portions: [['Cucchiaino (5 g)', 5], ['Bustina (4 g)', 4]] }),
  f('miele', 'Miele', 320, 80, 0.4, 0, { sugar: 80, portions: [['Cucchiaino (7 g)', 7]] }),
  f('marmellata', 'Marmellata / confettura', 246, 61, 0.5, 0, { fiber: 1, sugar: 55, portions: [['Cucchiaino (10 g)', 10]] }),
  f('cioccolato-fondente', 'Cioccolato fondente 70%', 565, 34, 9.5, 41, { fiber: 11, sugar: 28, portions: [['Quadratino (10 g)', 10]] }),
  f('cioccolato-latte', 'Cioccolato al latte', 541, 57, 7.5, 31, { fiber: 2, sugar: 55, portions: [['Quadratino (10 g)', 10]] }),
  f('crema-nocciole', 'Crema spalmabile alle nocciole', 539, 57.5, 6.3, 30.9, { sugar: 56, portions: [['Cucchiaino (15 g)', 15]], aliases: ['crema alla nocciola'] }),
  f('chips', 'Patatine in busta', 540, 50, 6.5, 34, { fiber: 4.5, salt: 1.3, portions: [['Busta piccola (25 g)', 25]] }),

  // Bevande
  f('caffe', 'Caffè espresso', 9, 1.7, 0.1, 0.2, { unit: 'ml', portions: [['1 tazzina (30 ml)', 30]], aliases: ['caffe', 'espresso'] }),
  f('cappuccino', 'Cappuccino (senza zucchero)', 40, 3, 2.2, 2.2, { unit: 'ml', sugar: 3, portions: [['1 tazza (150 ml)', 150]] }),
  f('te', 'Tè (senza zucchero)', 1, 0.2, 0, 0, { unit: 'ml', portions: [['1 tazza (250 ml)', 250]], aliases: ['te', 'tisana'] }),
  f('succo-arancia', 'Succo d’arancia 100%', 44, 10, 0.7, 0.2, { unit: 'ml', sugar: 9, portions: [['Bicchiere (200 ml)', 200]], aliases: ['spremuta'] }),
  f('cola', 'Bibita gassata zuccherata (cola)', 42, 10.6, 0, 0, { unit: 'ml', sugar: 10.6, portions: [['Lattina (330 ml)', 330], ['Bicchiere (250 ml)', 250]], aliases: ['coca cola', 'aranciata', 'bibita'] }),
  f('birra', 'Birra chiara', 43, 3.6, 0.5, 0, { unit: 'ml', portions: [['Bottiglia piccola (330 ml)', 330], ['Pinta (500 ml)', 500]] }),
  f('vino-rosso', 'Vino rosso', 85, 2.6, 0.1, 0, { unit: 'ml', portions: [['Bicchiere (125 ml)', 125]], aliases: ['vino'] }),
  f('vino-bianco', 'Vino bianco', 82, 2.6, 0.1, 0, { unit: 'ml', portions: [['Bicchiere (125 ml)', 125]], aliases: ['vino', 'prosecco'] }),
];
