# Regole di lavoro per il progetto Nutrizione

- App personale tipo YAZIO: diario dei pasti, calorie e macro, acqua, peso, digiuno, attività (anche da Health Connect).
- Stack: Vite + Svelte 5 (runes) + TypeScript strict + Capacitor 8 Android, dati in IndexedDB con Dexie. Niente CDN: tutto incluso nell'app.
  Rete solo per Open Food Facts (ricerca e codici a barre, via `CapacitorHttp` con User-Agent dell'app), per Google Gemini ("Foto AI", chiave personale dell'utente) e per il controllo aggiornamenti su GitHub.
- Foto AI: `src/lib/services/gemini.ts` (modelli in ordine di preferenza, si passa al successivo se manca o ha finito il limite gratuito) e `src/lib/logic/ai.ts` (prompt e lettura della risposta, con test). La chiave sta in `kv` con nome `geminiKey`, fuori dalle impostazioni: non deve mai finire nei backup.
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
- Health Connect: l'app chiede solo letture (passi, calorie attive e totali, distanza, allenamenti). I permessi in più dichiarati dal plugin si tolgono in `android/app/src/main/AndroidManifest.xml` con `tools:node="remove"`.
- R8 (minify) è spento di proposito: i plugin di Health Connect e dello scanner usano la reflection.
- Testi dell'interfaccia in italiano; codice e nomi in inglese.
