# Novità

## [0.9.4] - 2026-11-12

- Foto AI più costante: la stessa foto dà la stessa stima.
- Le correzioni ("Di meno", "Più condito"…) cambiano le stime solo dopo 3 volte.
- Nel Profilo puoi azzerare le correzioni imparate dalla Foto AI.
- Con la stessa foto e la stessa descrizione l'app ridà subito la stima di prima, senza chiedere di nuovo a Gemini; c'è il pulsante "Chiedi una nuova stima".
- Stime meno ballerine anche per foto nuove: Gemini riceve porzioni di riferimento, arrotonda i grammi e usa un "seme" fisso che riduce il caso.
- Prima bastava toccare due volte "Di meno" (anche sulla stessa foto) perché tutte le stime dopo diventassero più piccole. Ora ogni correzione conta una volta per stima, ne servono 3, e sotto la stima c'è scritto quando l'app ne ha tenuto conto.

## [0.9.3] - 2026-11-12

- Foto AI più rapida: ai modelli leggeri si chiede il ragionamento minimo.
- Se nessuno risponde in tempo, l'app riprova da sola invece di dare errore.
- Sotto la stima vedi quale modello ha risposto e in quanti secondi.
- Il 3.5 Flash-Lite e il 3.6 Flash ora lavorano con il ragionamento minimo, il più veloce (per il Flash-Lite è quello normale). Il 3.8 Flash non lo accetta e resta com'era.
- Se nessun modello risponde in tempo e resta almeno un terzo del tempo, l'app riprova una volta il modello più veloce.

## [0.9.2] - 2026-11-12

- Foto AI molto più veloce: i modelli non si aspettano più uno dopo l'altro.
- Se il modello migliore tarda, parte anche il successivo e vince la prima risposta.
- L'app ricorda i modelli lenti con le foto e per un giorno non li aspetta.
- Prima, con la foto, ogni modello Flash poteva tenere fermi fino a 45 secondi prima di passare al successivo: in tutto fino a 2 minuti. Ora parte il modello migliore e, se dopo 8 secondi non ha risposto, parte anche il successivo; un modello migliore ancora in corsa ha 6 secondi di vantaggio.
- La foto inviata è più leggera (768 pixel) e la richiesta passa dalla connessione del browser dell'app.

## [0.9.1] - 2026-11-12

- Passi e calorie ora arrivano solo dall'orologio, come in Mi Fitness.
- Nel Profilo vedi i numeri di ogni app (orologio, telefono…) e scegli quale usare.
- Calorie dell'allenamento molto più vicine a quelle dell'orologio.
- Perché i numeri non tornavano: Health Connect mette insieme i dati dell'orologio e quelli del telefono e, dove si sovrappongono, ne tiene uno solo. Durante l'allenamento, con il telefono appoggiato, mancavano circa 240 kcal e 800 passi.
- Ora l'app legge i dati app per app e in automatico usa l'orologio (l'app che registra gli allenamenti). Nel Profilo, "Passi e calorie da", puoi scegliere un'altra app o tutte insieme.
- Mi Fitness scrive le calorie a blocchi di mezz'ora: per l'allenamento l'app non divide più i blocchi in proporzione al tempo, ma toglie solo il movimento normale dei minuti fuori dall'allenamento.

## [0.9.0] - 2026-11-12

- Foto AI con la foto: se Gemini non risponde passa al modello successivo.
- Attività: l'allenamento e il resto della giornata sono separati.
- Profilo: scegli come dividere le calorie tra colazione, pranzo, cena e spuntini.
- Foto AI: Gemini a volte restava bloccato sulla foto e dopo un minuto compariva "Non riesco a contattare Gemini". Ora dopo 30 secondi senza risposta l'app prova il modello successivo e chiede in un modo che non si blocca; per un giorno parte già così.
- Allenamenti dall'orologio: niente più calorie sbagliate (16 kcal invece di 238). Se l'orologio non le manda a parte compare "–": toccando l'allenamento puoi scrivere il numero dell'app dell'orologio.
- Con il numero dell'allenamento la scheda Attività mostra "Allenamento" + "Resto della giornata", che insieme fanno il totale. Il totale dell'orologio comprende già l'allenamento, quindi non si somma due volte.
- Se l'orologio non ha ancora aggiornato il totale, le calorie bruciate sono almeno quelle dell'allenamento.
- Profilo, nuova sezione "Calorie nei pasti": proposte rapide (Classica, Pranzo principale, Cena principale, Più spuntini, Senza colazione) o percentuali scritte da te. Gli spuntini prendono quello che resta per arrivare a 100%. Un pasto a 0% non viene proposto nei consigli.
- Tolto dal Diario il tasto "Cosa sono le calorie?".
- Il consiglio "trascina in giù" sotto le calorie dell'orologio ora si legge per intero.

## [0.8.0] - 2026-11-11

- Una sola modalità: numeri e consigli sempre insieme, niente più interruttore.
- Alimenti: Piccola, Normale, Abbondante con i grammi, più la quantità esatta.
- Diario: carboidrati, proteine e grassi sempre in vista, con i consigli sotto.
- In ogni pasto vedi le calorie sull'obiettivo e il pallino verde, giallo o rosso.
- Nel Diario le porzioni a occhio mostrano anche i grammi ("Porzione abbondante · 14 g").
- Foto AI: ingredienti e grammi già aperti, li nascondi con un tocco.
- Se un alimento non indica la sua porzione, quella normale è stimata dalle calorie (l'app lo scrive).
- Avviso se la quantità scritta dà più di 1500 kcal per un solo alimento.
- Tolta la domanda "Conosci i valori nutrizionali?" all'inizio e la voce nel Profilo.

## [0.7.1] - 2026-11-11

- Scheda dell'alimento: il nome e "Porzione abbondante" non si sovrappongono più.
- "Crea alimento": tolto l'errore dopo il salvataggio, ora si apre subito la scheda.
- Foto AI: i nomi lunghi degli ingredienti vanno a capo invece di essere tagliati.
- Valori nutrizionali: la colonna colorata non tocca più la scritta sopra.
- Diario: "stimato con l'AI" al posto di "stimato con la foto".
- Nuovo controllo automatico delle scritte sovrapposte su tutte le schermate.

## [0.7.0] - 2026-11-11

- Widget anche in formato 2×1: tienilo premuto e trascina il bordo verso l'alto.
- Nuova schermata Sigarette con grafico e andamento: si apre toccando il widget.
- I widget passano al giorno nuovo da soli, senza dover aprire l'app.
- Nella schermata Sigarette puoi correggere anche i giorni passati.
- In Progressi compare la scheda Sigarette; i conteggi entrano nel backup.
- Grafici: tolto lo spazio vuoto in fondo alla pagina con "30 giorni".

## [0.6.0] - 2026-11-10

- Nuovo widget "Calorie rimaste" per la schermata Home, con il + per aggiungere un pasto.
- Nuovo widget "Sigarette": il numero di oggi con i pulsanti − e +.
- I widget non consumano batteria: si aggiornano solo quando cambia qualcosa.
- Il widget delle calorie si può allargare per vedere mangiate, bruciate e obiettivo.
- Il conteggio delle sigarette riparte da zero a mezzanotte.

## [0.5.2] - 2026-11-10

- Foto AI: dopo lo scatto hai il tempo di scrivere cosa c'è nel piatto, poi tocchi Calcola.
- Foto AI più affidabile: usa sempre il modello migliore e, se non riconosce il piatto, prova il successivo.
- Grafico: il numero della colonna non copre più la scritta dell'obiettivo.
- Quello che scrivi conta sempre, anche se la foto non si capisce (basta "salame").
- Foto più nitide; se la foto viene nera l'app lo dice subito.
- Se qualcosa non va, sotto l'errore compare una riga di dettagli da mandarmi.

## [0.5.1] - 2026-11-09

- Il + apre di nuovo il menu per aggiungere, anche in modalità semplice.
- App molto più leggera (da 30 a 8 MB): si apre prima e in background non lavora.
- Health Connect: tolto il VO2max, l'app legge solo passi, calorie, distanza e allenamenti.
- Foto AI: "Cerca un alimento" riporta alla ricerca con il cursore già pronto per scrivere.
- Controllo automatico dei permessi di Health Connect prima di ogni pubblicazione.

## [0.5.0] - 2026-11-09

- Modalità semplice: porzioni a occhio, semafori e consigli in parole (si attiva nel Profilo).
- Foto AI più facile: ti dice cosa ha visto, fa una domanda e si corregge con un tocco.
- I piatti che mangi spesso restano salvati e l'AI impara le tue correzioni.
- Nella modalità semplice il + apre subito la fotocamera, e il Diario suggerisce cosa mangiare al prossimo pasto.
- Tocca calorie, carboidrati, proteine, grassi o fibre per sapere cosa sono, con esempi.
- Se la stima supera 1500 kcal l'app chiede conferma (metà o un terzo).

## [0.4.1] - 2026-11-09

- Grafico delle calorie: i giorni sotto le colonne non si sovrappongono più.
- Ritmo a settimana scritto per intero (0,25 / 0,5 / 0,75 kg) e spiegato quando l'obiettivo resta al minimo.
- Le settimane per arrivare al peso obiettivo usano il ritmo davvero possibile.

## [0.4.0] - 2026-11-09

- Dati dell'orologio sempre aggiornati: ad app aperta si rileggono ogni minuto e ogni volta che torni nell'app.
- Trascina in giù il Diario per aggiornare subito calorie, passi e allenamenti.
- Foto AI più veloce: foto più leggera, usa per primo il modello che ha funzionato e mostra a che punto è.

## [0.3.0] - 2026-11-09

- Aggiornamenti dentro l'app: quando esce una versione nuova compare l'avviso anche ad app aperta, e con "Aggiorna" si scarica e si installa senza passare dal browser.
- Foto AI: accettate le chiavi nuove di Gemini, quelle che iniziano con "AQ.".
- Digiuno: tolta la spiegazione sopra i piani.

## [0.2.0] - 2026-11-09

- Foto AI: fotografa il piatto, aggiungi una descrizione e Google Gemini stima ingredienti, grammi e valori. Puoi correggere i grammi prima di aggiungerli al diario.
- La chiave di Gemini si mette nel Profilo, in "Intelligenza artificiale", e resta solo sul telefono.
- Tema scuro più pulito: sfondi e schede grigio scuro, senza la sfumatura verde.
- Digiuno: sotto ogni piano ci sono le ore di digiuno e le ore dei pasti, con una spiegazione.
- In alto il contenuto non scorre più sotto l'orologio del telefono.

## [0.1.0] - 2026-11-09

Prima versione.

- Diario dei pasti con calorie, carboidrati, proteine, grassi e fibre, giorno per giorno.
- Più di 140 alimenti di base, ricerca su Open Food Facts e scanner dei codici a barre.
- Alimenti creati da te, preferiti, recenti, "Solo kcal" e "Copia dall'ultimo giorno".
- Obiettivo di calorie calcolato dal profilo, con macronutrienti in percentuale.
- Acqua, peso con grafico, calorie della settimana.
- Digiuno intermittente con timer e avviso a fine digiuno.
- Attività a mano o dall'orologio con Health Connect.
- Backup in un file e avviso quando esce una versione nuova.
