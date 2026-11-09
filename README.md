# Nutrizione

Diario alimentare per Android, con le stesse funzioni principali di YAZIO.

- **Diario dei pasti**: colazione, pranzo, cena e spuntini, con calorie, carboidrati, proteine, grassi e fibre.
- **Alimenti**: più di 140 alimenti di base già nell'app (funzionano senza internet), ricerca online su Open Food Facts, scanner dei codici a barre, alimenti creati da te, preferiti e recenti, "Solo kcal" e "Copia dall'ultimo giorno".
- **Obiettivi**: calorie calcolate dal profilo (formula di Mifflin-St Jeor) per perdere, mantenere o aumentare peso; macronutrienti in percentuale.
- **Acqua**, **peso** con grafico, **digiuno intermittente** con timer e avviso, **attività** inserite a mano o lette dall'orologio tramite **Health Connect**.
- **Foto AI**: fotografa il piatto e Google Gemini stima ingredienti, grammi e valori (serve una chiave gratuita di Google AI Studio, da mettere nel Profilo).
- Backup in un file, controllo automatico degli aggiornamenti, tema chiaro e scuro.

Tutti i dati restano sul telefono. Solo se usi "Foto AI", la foto e la descrizione del piatto vengono mandate a Google Gemini.

## Installare l'app

1. Dal telefono apri https://github.com/Nikcirri/nutrizione/releases/latest
2. In fondo alla pagina, sotto "Assets", tocca il file `Nutrizione-vX.Y.Z.apk`.
3. Apri il file scaricato. Se Android blocca l'installazione, tocca **Impostazioni**, attiva **Consenti da questa origine** e torna indietro.
4. Tocca **Installa** (se compare Play Protect, **Installa comunque**).

Per aggiornare: l'app avvisa da sola quando c'è una versione nuova. La nuova versione si installa sopra quella vecchia e i dati restano.

## Collegare l'orologio

1. Nell'app del tuo orologio (Samsung Health, Fitbit, Garmin Connect, Zepp, Mi Fitness…) attiva la condivisione dei dati con **Health Connect**.
2. In Nutrizione, nel Diario, tocca **Collega Health Connect** e consenti passi, calorie, distanza e allenamenti.
3. Nel Profilo, in "Quanto ti muovi", scegli **Sedentario**: così l'attività dell'orologio non viene contata due volte.

Su Android 13 o precedenti serve l'app Health Connect dal Play Store; da Android 14 è già nel telefono.

## Per chi sviluppa

- Vite + Svelte 5 + TypeScript + Capacitor 8 (Android). Dati in IndexedDB con Dexie.
- `src/lib/logic`: funzioni pure con i test (`*.test.ts`). `src/lib/data/foods.ts`: alimenti di base. `src/lib/services`: Open Food Facts, scanner, Health Connect, notifiche, backup, aggiornamenti. `src/views`: schermate e fogli.
- `npm run dev` avvia la versione web, `npm run verify` fa controllo dei tipi, test e build.
- Quando su `main` cambia la versione in `package.json`, GitHub Actions costruisce l'APK firmato e pubblica la Release (`.github/workflows/release.yml`). A ogni push `.github/workflows/check.yml` fa i controlli e una build Android di prova.
- Regole di lavoro: [`CLAUDE.md`](CLAUDE.md). Novità: [`CHANGELOG.md`](CHANGELOG.md).

I dati dei prodotti arrivano da [Open Food Facts](https://world.openfoodfacts.org) (licenza ODbL).
