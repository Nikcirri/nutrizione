// Idee per il prossimo pasto, con porzioni normali. Calorie indicative, arrotondate.
import type { MealId } from '../types';

export interface MealIdea {
  id: string;
  name: string;
  meals: MealId[];
  kcal: number;
  /** Buona fonte di proteine (per il consiglio "poche proteine"). */
  protein: boolean;
  /** Contiene verdura o frutta (per il consiglio "poche fibre"). */
  veg: boolean;
}

export const MEAL_IDEAS: readonly MealIdea[] = [
  // Colazione
  { id: 'yogurt-frutta-avena', name: 'Yogurt greco con frutta e un po’ di avena', meals: ['colazione'], kcal: 280, protein: true, veg: true },
  { id: 'caffelatte-fette', name: 'Caffellatte e 3 fette biscottate con marmellata', meals: ['colazione'], kcal: 300, protein: false, veg: false },
  { id: 'pane-ricotta', name: 'Pane integrale con ricotta e un filo di miele', meals: ['colazione'], kcal: 320, protein: true, veg: false },
  { id: 'uova-pane', name: '2 uova strapazzate con una fetta di pane', meals: ['colazione'], kcal: 330, protein: true, veg: false },
  { id: 'cappuccino-cornetto', name: 'Cappuccino e cornetto', meals: ['colazione'], kcal: 290, protein: false, veg: false },
  { id: 'porridge', name: 'Porridge d’avena con latte e banana', meals: ['colazione'], kcal: 350, protein: false, veg: true },

  // Pranzo e cena
  { id: 'minestrone', name: 'Minestrone con parmigiano e una fetta di pane', meals: ['pranzo', 'cena'], kcal: 300, protein: false, veg: true },
  { id: 'pollo-verdure', name: 'Petto di pollo ai ferri con verdure e una fetta di pane', meals: ['pranzo', 'cena'], kcal: 400, protein: true, veg: true },
  { id: 'frittata', name: 'Frittata di 2 uova con verdure e pane', meals: ['pranzo', 'cena'], kcal: 420, protein: true, veg: true },
  { id: 'legumi', name: 'Ceci o lenticchie con verdure e una fetta di pane', meals: ['pranzo', 'cena'], kcal: 430, protein: true, veg: true },
  { id: 'pasta-pomodoro', name: 'Pasta al pomodoro (piatto normale) e insalata', meals: ['pranzo', 'cena'], kcal: 460, protein: false, veg: true },
  { id: 'pesce-patate', name: 'Pesce al forno con patate e verdure', meals: ['pranzo', 'cena'], kcal: 480, protein: true, veg: true },
  { id: 'insalatona', name: 'Insalatona con tonno, uovo e pane', meals: ['pranzo', 'cena'], kcal: 500, protein: true, veg: true },
  { id: 'riso-pollo', name: 'Riso con verdure e pollo', meals: ['pranzo', 'cena'], kcal: 550, protein: true, veg: true },
  { id: 'pasta-legumi', name: 'Pasta e fagioli (o pasta e ceci)', meals: ['pranzo', 'cena'], kcal: 520, protein: true, veg: true },
  { id: 'piadina', name: 'Piadina con prosciutto crudo, mozzarella e rucola', meals: ['pranzo', 'cena'], kcal: 620, protein: true, veg: true },
  { id: 'pizza', name: 'Pizza margherita', meals: ['pranzo', 'cena'], kcal: 900, protein: false, veg: false },

  // Spuntini
  { id: 'frutto', name: 'Un frutto', meals: ['spuntini'], kcal: 80, protein: false, veg: true },
  { id: 'yogurt', name: 'Uno yogurt bianco', meals: ['spuntini'], kcal: 90, protein: true, veg: false },
  { id: 'frutta-secca', name: 'Una manciata di frutta secca', meals: ['spuntini'], kcal: 180, protein: true, veg: false },
  { id: 'cracker', name: 'Un pacchetto di crackers', meals: ['spuntini'], kcal: 110, protein: false, veg: false },
  { id: 'carote', name: 'Carote o finocchi da sgranocchiare', meals: ['spuntini'], kcal: 40, protein: false, veg: true },
];
