// Parti dell'app caricate solo quando servono: all'apertura il telefono legge meno codice e il Diario
// compare prima. Poco dopo, quando il telefono è libero, `preloadAll` le prepara tutte, così le schede
// e i fogli si aprono comunque senza attese.

export const load = {
  onboarding: () => import('./views/Onboarding.svelte'),
  digiuno: () => import('./views/Digiuno.svelte'),
  progressi: () => import('./views/Progressi.svelte'),
  profilo: () => import('./views/Profilo.svelte'),
  addFood: () => import('./views/sheets/AddFoodSheet.svelte'),
  aiMeal: () => import('./views/sheets/AiMealSheet.svelte'),
  myFoods: () => import('./views/sheets/MyFoodsSheet.svelte'),
  detail: () => import('./views/sheets/FoodDetailSheet.svelte'),
  createFood: () => import('./views/sheets/CreateFoodSheet.svelte'),
  quickAdd: () => import('./views/sheets/QuickAddSheet.svelte'),
  activity: () => import('./views/sheets/ActivitySheet.svelte'),
  weight: () => import('./views/sheets/WeightSheet.svelte'),
  cigarettes: () => import('./views/sheets/CigarettesSheet.svelte'),
};

/** Prepara in anticipo tutte le parti, quando il telefono non ha altro da fare. */
export function preloadAll(): void {
  const run = () => {
    for (const fn of Object.values(load)) void fn().catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 1500);
}
