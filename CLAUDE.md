# Regole di lavoro per il progetto Nutrizione

- App personale tipo YAZIO: diario dei pasti, calorie e macro, acqua, peso, digiuno, attività (anche da Health Connect).
- Stack: Vite + Svelte 5 (runes) + TypeScript strict + Capacitor 8 Android, dati in IndexedDB con Dexie. Niente CDN: tutto incluso nell'app.
  Rete solo per Open Food Facts (ricerca e codici a barre, via `CapacitorHttp` con User-Agent dell'app), per Google Gemini ("Foto AI", chiave personale dell'utente) e per il controllo aggiornamenti su GitHub.
- Foto AI: `src/lib/services/gemini.ts` e `src/lib/logic/ai.ts` (prompt, schema della risposta `MEAL_SCHEMA` per `responseJsonSchema`, lettura, con test).
  Si usa sempre il modello migliore disponibile: chi finisce il limite gratuito (circa 20 richieste al giorno sui Flash) va in pausa in `kv` `aiModelPauses` fino alla mezzanotte di Los Angeles, chi non esiste per 7 giorni. Se un modello non riconosce il cibo si prova il successivo; sotto l'errore si mostra la riga dei tentativi.
  Dopo la foto la stima NON parte da sola (l'utente vuole il tempo di scrivere la descrizione); la descrizione ha la precedenza sulla foto. La chiave sta in `kv` con nome `geminiKey`, fuori dalle impostazioni: non deve mai finire nei backup.
  L'AI risponde anche con porzione, frase "perché", e fino a 2 domande con risposte pronte. Le correzioni con i pulsanti si salvano come abitudini (`kv` `aiHabits`) e finiscono nel prompt; i piatti aggiunti vanno nella tabella `dishes` (schema `version(2)`), mostrati come "I tuoi piatti". Sopra 1500 kcal l'app chiede conferma.
- Modalità semplice (`prefs.simpleMode`, scelta nell'onboarding e nel Profilo) per chi non conosce i valori nutrizionali: porzioni Piccola/Normale/Abbondante, semafori, consigli e idee per il prossimo pasto (`src/lib/logic/simple.ts`, idee in `src/lib/data/mealIdeas.ts`). La modalità normale resta com'era.
- Il + (centrale e dei pasti) apre sempre il menu Aggiungi, anche in modalità semplice: l'utente non vuole che apra subito la fotocamera.
- Logica in funzioni pure dentro `src/lib/logic`, con test Vitest. Il database passa da `src/lib/repo.ts` (test con fake-indexeddb in `src/lib/repo.test.ts`).
- Grafica: tema verde lime (variabili in `src/app.css`), schede bianche molto arrotondate, carattere Outfit incluso. Il colore dei grafici è `--chart` (verificato per il contrasto).
  Nel tema scuro sfondi e schede sono grigio/nero neutri (l'utente non vuole la sfumatura verde): il verde resta solo su pulsanti e indicatori.
- Implementa tutto per intero: niente codice troncato, niente `TODO`, niente funzioni vuote o segnaposto.
- Fine di ogni modifica, sempre in quest'ordine:
  1. `npm run verify` (controllo tipi + test + build) deve passare;
  2. `npx cap sync android`;
  3. aggiorna `CHANGELOG.md` con una sezione `## [X.Y.Z] - AAAA-MM-GG` e la versione in `package.json`;
  4. commit e push su `main`: quando cambia la versione in `package.json`, GitHub Actions costruisce l'APK firmato e pubblica la Release `vX.Y.Z`;
  5. dai all'utente il link https://github.com/Nikcirri/nutrizione/releases/latest e un elenco breve di cose da provare sul telefono.
- L'utente è principiante e usa solo il telefono: istruzioni passo passo, parole semplici, niente comandi da terminale per lui.
- La chiave di firma non va mai nel repository: vive nei Secrets di GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`); il workflow legge da solo il nome (alias) della chiave. Non cambiarla mai.
- Non cambiare `appId` (`com.nikcirri.nutrizione`) né il nome del database IndexedDB (`nutrizione`). Se cambi lo schema, aggiungi una nuova `version()` in `src/lib/db.ts` senza togliere le vecchie.
- Dati di Health Connect sempre freschi (`src/lib/healthSync.ts`): rilettura ogni minuto ad app aperta sul Diario, al ritorno nell'app e con "trascina in giù" (Diario e Progressi, in `App.svelte`).
- Health Connect: l'app chiede solo letture (passi, calorie attive e totali, distanza, allenamenti). I permessi in più dichiarati dal plugin si tolgono in `android/app/src/main/AndroidManifest.xml` con `tools:node="remove"`.
  `src/android.test.ts` confronta il manifest con quello del plugin e `scripts/check-apk.sh` controlla l'APK finito in GitHub Actions: se compare un permesso non previsto la build si ferma.
- Aggiornamenti: controllo all'apertura e al ritorno nell'app (al massimo ogni 10 minuti, `src/lib/state/update.svelte.ts`); "Aggiorna" scarica l'APK con il plugin dell'app `AppUpdaterPlugin.java` (accetta solo URL delle Release di questo repo) e apre l'installazione di Android (permesso `REQUEST_INSTALL_PACKAGES`). Le prime 3 righe del changelog compaiono nell'avviso: scrivile brevi.
- Widget della schermata Home (codice in `android/app/src/main/java/com/nikcirri/nutrizione/widgets/`, layout `res/layout/widget_*.xml`):
  "Calorie rimaste": i numeri di oggi li manda l'app con `WidgetsPlugin.setCalories` a ogni modifica (`src/lib/widgetSync.svelte.ts`, logica in `src/lib/logic/widget.ts`); toccarlo apre l'app, il suo + apre il menu Aggiungi.
  "Sigarette": − e + funzionano ad app chiusa (`WidgetActionReceiver`); toccare il resto apre nell'app la schermata Sigarette. Un numero per giorno nelle SharedPreferences `widgets` (chiavi `cig_AAAA-MM-GG`): è fuori dal database, l'app lo legge e lo cambia con il plugin (`src/lib/services/widgets.ts`) e lo mette nel backup (campo `cigarettes`).
  Ogni widget ha due disegni, normale e basso (`*_small.xml`, per il 2×1): da Android 12 si consegnano entrambi e la schermata Home sceglie in base alla misura (`RemoteViews(Map<SizeF, RemoteViews>)`). Stessi id nei due disegni.
  Nei layout solo viste ammesse nei widget (LinearLayout, TextView, ImageView, ProgressBar…), controllate da `src/android.test.ts`.
  Cambio del giorno: sul telefono dell'utente (Samsung) la sola sveglia che non accende il telefono non bastava. Ora tre cose insieme: sveglia `setWindow` a mezzanotte, sveglia `setAndAllowWhileIdle` (suona anche a telefono fermo) e `updatePeriodMillis` di 30 minuti come riserva. Non toglierne nessuna senza provarlo sul telefono.
  I tocchi sui widget che aprono l'app arrivano con l'evento `widgetAction` (`addMeal`, `cigarettes`), gestito in `App.svelte`.
- Schermata Sigarette (`src/views/sheets/CigarettesSheet.svelte`, conti in `src/lib/logic/cigarettes.ts` con test): conteggio del giorno scelto con − e +, grafico 7/14/30 giorni, media e andamento. Le medie contano solo i giorni finiti (oggi escluso) e solo dal primo conteggio in poi; l'andamento confronta gli ultimi giorni con altrettanti prima (da 3 contro 3 fino a 7 contro 7). Toni neutri: niente prediche sul fumo. In Progressi la scheda Sigarette compare solo se il contatore è stato usato.
- R8 (minify) è spento di proposito: i plugin di Health Connect e dello scanner usano la reflection.
- Leggerezza (APK circa 8 MB): solo librerie ARM (`abiFilters` in `android/app/build.gradle`); il modello ML Kit del codice a barre non è nell'APK (sostituzione in `android/build.gradle`, si usa lo scanner di Google Play services).
  Schede e fogli si caricano quando servono (`src/lazy.ts`, precaricati quando il telefono è libero); il Diario resta nel codice iniziale.
  Timer solo ad app aperta: usa `repeatInForeground` (`src/lib/foreground.ts`), mai `setInterval` lasciato girare in background.
- Testi dell'interfaccia in italiano; codice e nomi in inglese.
