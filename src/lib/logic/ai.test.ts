import { describe, expect, it } from 'vitest';
import {
  habitsHints,
  isDressing,
  whyText,
  NO_HABITS,
  buildPrompt,
  extractJson,
  geminiProblem,
  geminiText,
  itemPer100,
  looksLikeGeminiKey,
  looksBlank,
  MEAL_SCHEMA,
  modelLabel,
  modelsToTry,
  msToPacificMidnight,
  pauseUntil,
  describeAttempts,
  isTimeoutError,
  GRACE_MS,
  OVERALL_MS,
  raceStep,
  pickModels,
  LATEST_ALIASES,
  wasSlow,
  estimateKey,
  findCached,
  fingerprint,
  habitsLabels,
  sanitizeCache,
  withCached,
  thinkingLevelFor,
  STAGGER_MS,
  parseAiMeal,
  scaleItem,
  waitingMessage,
} from './ai';

describe('AI: richiesta', () => {
  it('la descrizione vince sulla foto, e senza descrizione si stima anche con foto scure', () => {
    expect(buildPrompt('salame', true)).toContain('anche se la foto è scura, sfocata o non si capisce, stima sempre il cibo descritto');
    const photoOnly = buildPrompt('', true);
    expect(photoOnly).toContain('stima comunque il cibo più probabile');
    expect(photoOnly).not.toContain('stima sempre il cibo descritto');
    expect(buildPrompt('salame', false)).toContain('solo se la descrizione non parla di cibo');
  });
  it('include la descrizione solo se c’è', () => {
    expect(buildPrompt('  pasta al pesto  ', true)).toContain('"""pasta al pesto"""');
    expect(buildPrompt('', true)).not.toContain('Descrizione');
    expect(buildPrompt('riso', false)).toContain('Non c’è una foto');
  });
});

describe('AI: risposta', () => {
  const text = '```json\n{"dish":"Pasta al pomodoro","confidence":"Alta","note":"olio stimato","items":[' +
    '{"name":"Spaghetti cotti","grams":180,"kcal":284,"carbs":56,"protein":10,"fat":1.6,"fiber":2.5},' +
    '{"name":"Olio","grams":"10","kcal":"","carbs":0,"protein":0,"fat":10,"fiber":0},' +
    '{"name":"","grams":5},{"name":"Niente","grams":0,"kcal":5}]}\n```';

  it('legge il JSON anche dentro ``` e scarta le voci rotte', () => {
    const meal = parseAiMeal(text);
    expect(meal?.dish).toBe('Pasta al pomodoro');
    expect(meal?.confidence).toBe('alta');
    expect(meal?.items).toHaveLength(2);
    expect(meal?.items[1]).toMatchObject({ name: 'Olio', grams: 10, kcal: 90, fat: 10 });
  });

  it('risposte non valide', () => {
    expect(parseAiMeal('non so')).toBeNull();
    expect(parseAiMeal('{"dish":"x"}')).toBeNull();
    expect(extractJson('{rotto')).toBeNull();
    expect(parseAiMeal('{"items":[]}')).toEqual({ dish: 'Piatto', items: [], confidence: 'media', note: '', portion: 'normale', why: '', questions: [] });
  });

  it('cambia la quantità e calcola i valori per 100 g', () => {
    const item = { name: 'Riso', grams: 200, kcal: 260, carbs: 56, protein: 5.4, fat: 0.6, fiber: 0.8 };
    expect(scaleItem(item, 100).kcal).toBeCloseTo(130);
    expect(itemPer100(item)).toEqual({ kcal: 130, carbs: 28, protein: 2.7, fat: 0.3, fiber: 0.4 });
  });

  it('testo della risposta senza il ragionamento', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'pensiero', thought: true }, { text: '{"a":' }, { text: '1}' }] } }] };
    expect(geminiText(json)).toBe('{"a":1}');
    expect(geminiText({})).toBe('');
  });

  it('riconosce gli errori di Gemini', () => {
    expect(geminiProblem(400, { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } })).toBe('key');
    expect(geminiProblem(429, { error: { message: 'Resource has been exhausted' } })).toBe('quota');
    expect(geminiProblem(404, { error: { message: 'models/x is not found' } })).toBe('model');
    expect(geminiProblem(400, { error: { message: 'User location is not supported for the API use.' } })).toBe('region');
    expect(geminiProblem(500, {})).toBe('other');
  });

  it('forma delle chiavi', () => {
    expect(looksLikeGeminiKey('AIzaSyD-abcdefghijklmnopqrstuvwxyz012345')).toBe(true);
    expect(looksLikeGeminiKey('AQ.Ab8RN6Jxl6OdplEKqxwlbG2IZ7PNmYabcdefghijkl')).toBe(true);
    expect(looksLikeGeminiKey('sk-123')).toBe(false);
    expect(looksLikeGeminiKey('projects/355147696887')).toBe(false);
  });
});

describe('AI: velocità', () => {
  it('usa sempre il modello migliore disponibile, saltando quelli in pausa', () => {
    const models = ['a', 'b', 'c'];
    const now = 1_000_000;
    expect(modelsToTry(models, {}, now)).toEqual(['a', 'b', 'c']);
    expect(modelsToTry(models, { a: now + 5000 }, now)).toEqual(['b', 'c']);
    // La pausa finita non conta più: il migliore torna primo.
    expect(modelsToTry(models, { a: now - 1 }, now)).toEqual(['a', 'b', 'c']);
    // Tutti in pausa: si provano comunque.
    expect(modelsToTry(models, { a: now + 1, b: now + 1, c: now + 1 }, now)).toEqual(['a', 'b', 'c']);
  });
  it('pausa giusta dopo un errore', () => {
    const now = Date.UTC(2026, 10, 10, 20, 0, 0); // 12:00 a Los Angeles
    const day = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
    expect(pauseUntil(429, day, now)).toBe(now + 12 * 3600_000 + 60_000);
    const minute = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '42s' }] } };
    expect(pauseUntil(429, minute, now)).toBe(now + 42_000);
    expect(pauseUntil(429, { error: { code: 429 } }, now)).toBe(now + 60_000);
    expect(pauseUntil(404, { error: { code: 404 } }, now)).toBe(now + 7 * 24 * 3600_000);
    expect(pauseUntil(400, { error: { code: 400, message: 'bad' } }, now)).toBeNull();
  });
  it('mezzanotte di Los Angeles', () => {
    expect(msToPacificMidnight(Date.UTC(2026, 10, 10, 7, 59, 0))).toBe(2 * 60_000); // 23:59 a LA: 1 minuto + 1 di margine
    expect(msToPacificMidnight(Date.UTC(2026, 6, 10, 7, 0, 0))).toBe(24 * 3600_000 + 60_000); // 00:00 in estate (UTC-7)
  });
  it('nomi dei modelli e riepilogo dei tentativi', () => {
    expect(modelLabel('gemini-3.5-flash-lite')).toBe('3.5 Flash-Lite');
    expect(modelLabel('gemini-3.8-flash')).toBe('3.8 Flash');
    expect(
      describeAttempts([
        { model: 'gemini-3.8-flash', outcome: 'quota' },
        { model: 'gemini-3.5-flash-lite', outcome: 'empty' },
      ]),
    ).toBe('3.8 Flash: limite gratuito raggiunto · 3.5 Flash-Lite: nessun cibo riconosciuto');
  });
  it('riconosce le foto nere o vuote', () => {
    const fill = (f: (i: number) => [number, number, number]) => {
      const a = new Uint8ClampedArray(24 * 24 * 4);
      for (let i = 0; i < 24 * 24; i++) a.set([...f(i), 255], i * 4);
      return a;
    };
    expect(looksBlank(fill(() => [0, 0, 0]))).toBe(true);
    expect(looksBlank(fill(() => [200, 200, 200]))).toBe(true);
    expect(looksBlank(fill((i) => (i % 2 ? [3, 3, 3] : [6, 5, 4])))).toBe(true);
    // Foto vera, anche se scura: c'è variazione.
    expect(looksBlank(fill((i) => [(i * 7) % 60, (i * 3) % 40, (i * 5) % 30]))).toBe(false);
    expect(looksBlank(fill((i) => (i % 3 ? [180, 120, 60] : [40, 90, 30])))).toBe(false);
  });
  it('lo schema chiede tutti i campi che l’app legge', () => {
    expect(MEAL_SCHEMA.required).toEqual(['dish', 'portion', 'confidence', 'items', 'why', 'note', 'questions']);
    expect(MEAL_SCHEMA.properties.items.items.required).toContain('grams');
  });
  it('messaggi durante l’attesa', () => {
    expect(waitingMessage(1, true)).toBe('Invio la foto…');
    expect(waitingMessage(5, false)).toBe('Leggo la descrizione…');
    expect(waitingMessage(30, true)).toMatch(/più del solito/);
  });
});

describe('AI: porzione, perché e domande', () => {
  it('legge porzione, perché e domande (scarta quelle rotte)', () => {
    const meal = parseAiMeal(JSON.stringify({
      dish: 'Cotoletta', portion: 'Abbondante', why: 'Quasi metà arriva dalla frittura.',
      items: [{ name: 'Cotoletta', grams: 200, kcal: 520, carbs: 26, protein: 36, fat: 30, fiber: 1 }],
      questions: [
        { question: 'Era fritta o al forno?', options: [{ label: 'Fritta', factor: 1, add: null }, { label: 'Al forno', factor: 0.75 }] },
        { question: 'Zucchero?', options: [{ label: 'No' }, { label: 'Sì', add: { name: 'Zucchero', grams: 5, kcal: 20, carbs: 5 } }] },
        { question: 'Una sola risposta', options: [{ label: 'x' }] },
        { question: 'Troppe', options: [{ label: 'a' }, { label: 'b' }] },
      ],
    }));
    expect(meal?.portion).toBe('abbondante');
    expect(meal?.why).toMatch(/frittura/);
    expect(meal?.questions).toHaveLength(2);
    expect(meal?.questions[0]?.options[1]).toEqual({ label: 'Al forno', factor: 0.75, add: null });
    expect(meal?.questions[1]?.options[1]?.add).toMatchObject({ name: 'Zucchero', grams: 5, kcal: 20 });
  });
  it('riconosce i condimenti', () => {
    expect(isDressing({ name: 'Olio extravergine', kcal: 90, fat: 10 })).toBe(true);
    expect(isDressing({ name: 'Parmigiano', kcal: 39, fat: 2.8 })).toBe(true);
    expect(isDressing({ name: 'Noci', kcal: 200, fat: 19 })).toBe(true);
    expect(isDressing({ name: 'Spaghetti cotti', kcal: 316, fat: 1.4 })).toBe(false);
  });
  it('perché: dall’AI o dall’ingrediente più calorico', () => {
    const items = [
      { name: 'Pasta', grams: 200, kcal: 300, carbs: 60, protein: 10, fat: 1, fiber: 2 },
      { name: 'Olio', grams: 10, kcal: 90, carbs: 0, protein: 0, fat: 10, fiber: 0 },
    ];
    expect(whyText({ why: 'Dall’AI' }, items)).toBe('Dall’AI');
    expect(whyText({ why: '' }, items)).toBe('La parte più calorica è pasta (circa 77% del piatto).');
  });
  it('abitudini dalle correzioni e nel prompt', () => {
    expect(habitsHints(NO_HABITS)).toEqual([]);
    const hints = habitsHints({ lessDressing: 3, moreDressing: 0, smaller: 0, bigger: 3 });
    expect(hints).toHaveLength(2);
    const prompt = buildPrompt('', true, { habits: hints, knownDishes: ['Colazione solita'] });
    expect(prompt).toContain('condisce poco');
    expect(prompt).toContain('Colazione solita');
    // Riferimenti fissi per grammi più stabili.
    expect(prompt).toContain('peso da crudi');
  });
});

describe('AI: nessuna risposta in tempo', () => {
  it('riconosce quando Gemini non ha risposto in tempo', () => {
    expect(isTimeoutError(new Error('timeout'))).toBe(true);
    expect(isTimeoutError(new Error('Read timed out'))).toBe(true);
    expect(isTimeoutError(new Error('failed to connect to generativelanguage.googleapis.com after 15000ms: Timed out'))).toBe(true);
    expect(isTimeoutError(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))).toBe(true);
    // Senza rete non è un "tempo scaduto".
    expect(isTimeoutError(new Error('Unable to resolve host "generativelanguage.googleapis.com"'))).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });

  it('lo scrive nella riga dei tentativi', () => {
    expect(describeAttempts([{ model: 'gemini-3.8-flash', outcome: 'timeout' }, { model: 'gemini-3.6-flash', outcome: 'ok' }])).toBe(
      '3.8 Flash: nessuna risposta in tempo · 3.6 Flash: ok',
    );
  });
});

describe('AI: più modelli a scaglioni', () => {
  const base = { total: 3, lastIsSlow: false, sinceLastStart: 0, sinceFirstOk: null, elapsed: 0 };
  it('si parte dal migliore e, se tarda, si avvia il successivo', () => {
    expect(raceStep({ ...base, results: [] })).toEqual({ type: 'start' });
    expect(raceStep({ ...base, results: [null], sinceLastStart: 3000, elapsed: 3000 })).toEqual({ type: 'wait' });
    expect(raceStep({ ...base, results: [null], sinceLastStart: STAGGER_MS, elapsed: STAGGER_MS })).toEqual({ type: 'start' });
    // Limite finito o errore: il successivo parte subito.
    expect(raceStep({ ...base, results: ['fail'], sinceLastStart: 500, elapsed: 500 })).toEqual({ type: 'start' });
    // Un modello lento con le foto non ha vantaggio.
    expect(raceStep({ ...base, results: [null], lastIsSlow: true })).toEqual({ type: 'start' });
  });

  it('vince la prima risposta buona, ma il migliore ha qualche secondo di vantaggio', () => {
    expect(raceStep({ ...base, results: ['ok', null] })).toEqual({ type: 'use', index: 0 });
    expect(raceStep({ ...base, results: [null, null, 'ok'], sinceFirstOk: 1000, elapsed: 20000 })).toEqual({ type: 'wait' });
    expect(raceStep({ ...base, results: [null, null, 'ok'], sinceFirstOk: GRACE_MS, elapsed: 25000 })).toEqual({ type: 'use', index: 2 });
    expect(raceStep({ ...base, results: ['fail', 'ok', null], sinceFirstOk: 0 })).toEqual({ type: 'use', index: 1 });
  });

  it('chiave sbagliata: ci si ferma; tutti finiti o tempo scaduto: si chiude', () => {
    expect(raceStep({ ...base, results: [null, 'stop'] })).toEqual({ type: 'stop', index: 1 });
    expect(raceStep({ ...base, results: ['fail', 'empty', 'fail'] })).toEqual({ type: 'finish' });
    expect(raceStep({ ...base, results: [null, null, null], elapsed: OVERALL_MS })).toEqual({ type: 'finish' });
    expect(raceStep({ ...base, total: 1, results: [null], sinceLastStart: 30000, elapsed: 30000 })).toEqual({ type: 'wait' });
  });
});

describe('AI: quanto ragionamento chiedere', () => {
  it('minimo dove è accettato (più veloce), basso sui Flash più nuovi', () => {
    expect(thinkingLevelFor('gemini-3.5-flash-lite')).toBe('minimal');
    expect(thinkingLevelFor('gemini-3.6-flash')).toBe('minimal');
    expect(thinkingLevelFor('gemini-3.8-flash')).toBe('low');
    expect(thinkingLevelFor('gemini-4-flash')).toBe('low');
  });

  it('i secondi nella riga dei tentativi', () => {
    expect(describeAttempts([{ model: 'gemini-3.8-flash', outcome: 'slower' }, { model: 'gemini-3.5-flash-lite', outcome: 'ok', seconds: 12 }])).toBe(
      '3.8 Flash: più lento di un altro · 3.5 Flash-Lite: ok (12 s)',
    );
  });
});

describe('AI: stessa foto, stessa stima', () => {
  const meal = { dish: 'Penne al tonno', portion: 'normale', confidence: 'alta', why: '', note: '', questions: [], items: [{ name: 'Pasta', grams: 90, kcal: 320, carbs: 65, protein: 11, fat: 1.5, fiber: 3 }] };
  it('impronta uguale per contenuti uguali, diversa per contenuti diversi', () => {
    const photo = 'A'.repeat(50_000);
    expect(fingerprint(photo)).toBe(fingerprint('A'.repeat(50_000)));
    expect(fingerprint(photo)).not.toBe(fingerprint('A'.repeat(49_999) + 'B'));
    expect(estimateKey(photo, ' penne ', [])).toBe(estimateKey(photo, 'penne', []));
    expect(estimateKey(photo, 'penne', [])).not.toBe(estimateKey(photo, 'penne al tonno', []));
    expect(estimateKey(photo, 'penne', [])).not.toBe(estimateKey(photo, 'penne', ['Di solito condisce poco.']));
    expect(estimateKey(null, 'penne', [])).not.toBe(estimateKey(photo, 'penne', []));
  });

  it('si ritrova la stima, si tengono le ultime e si scartano quelle vecchie o rovinate', () => {
    const now = Date.UTC(2026, 10, 12);
    const list = withCached([], { key: 'k1', at: now, model: 'gemini-3.6-flash', meal: meal as never });
    const back = sanitizeCache(JSON.parse(JSON.stringify(list)), now);
    expect(findCached(back, 'k1')?.meal.items[0]?.kcal).toBe(320);
    expect(findCached(back, 'k2')).toBeNull();
    expect(sanitizeCache(list, now + 31 * 24 * 3600 * 1000)).toEqual([]);
    expect(sanitizeCache([{ key: 'x', at: now, model: 'm', meal: { items: [] } }, 5, null], now)).toEqual([]);
    expect(sanitizeCache('rotto', now)).toEqual([]);
    let many = back;
    for (let i = 0; i < 40; i++) many = withCached(many, { ...back[0]!, key: `n${i}` });
    expect(many).toHaveLength(30);
    expect(many[0]?.key).toBe('n39');
  });
});

describe('AI: abitudini dalle correzioni', () => {
  it('servono 3 correzioni nette', () => {
    expect(habitsHints({ lessDressing: 0, moreDressing: 0, smaller: 2, bigger: 0 })).toEqual([]);
    expect(habitsHints({ lessDressing: 0, moreDressing: 0, smaller: 3, bigger: 0 })).toEqual(['Di solito mangia porzioni più piccole della media.']);
    expect(habitsLabels({ lessDressing: 4, moreDressing: 1, smaller: 3, bigger: 1 })).toEqual(['condisci poco']);
  });
});

describe('AI: modelli lenti con le foto', () => {
  it('lento solo chi è rimasto senza risposta a lungo, non chi è stato superato', () => {
    expect(wasSlow('timeout', 3000)).toBe(true);
    expect(wasSlow(null, 25_000)).toBe(true);
    // Superato da un modello più veloce dopo pochi secondi: non è lento.
    expect(wasSlow(null, 6_000)).toBe(false);
    expect(wasSlow('ok', 30_000)).toBe(false);
    expect(wasSlow('quota', 1_000)).toBe(false);
  });
});

describe('AI: modelli nuovi senza aggiornare l’app', () => {
  const FALLBACK = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  const gen = (name: string) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent', 'countTokens'] });
  it('prende i due Flash più nuovi e il Flash-Lite più nuovo', () => {
    const listed = [
      gen('gemini-3.5-flash'),
      gen('gemini-3.8-flash'),
      gen('gemini-3.6-flash'),
      gen('gemini-3.5-flash-lite'),
      gen('gemini-3.7-flash-lite'),
      gen('gemini-3.8-flash-image'),
      gen('gemini-3.8-pro'),
      gen('gemini-flash-latest'),
      { name: 'models/gemini-4-flash-live', supportedGenerationMethods: ['bidiGenerateContent'] },
      { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
    ];
    expect(pickModels(listed, FALLBACK)).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.7-flash-lite']);
  });

  it('quando esce un modello nuovo lo usa da sola; a pari versione solo quello stabile', () => {
    const listed = [gen('gemini-3.8-flash'), gen('gemini-4-flash-preview'), gen('gemini-4-flash'), gen('gemini-3.5-flash-lite')];
    expect(pickModels(listed, FALLBACK)).toEqual(['gemini-4-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });

  it('se di una versione esiste solo la preview, usa la preview', () => {
    const listed = [gen('gemini-3.8-flash'), gen('gemini-4-flash-preview'), gen('gemini-4-flash-lite-preview')];
    expect(pickModels(listed, FALLBACK)).toEqual(['gemini-4-flash-preview', 'gemini-3.8-flash', 'gemini-4-flash-lite-preview']);
  });

  it('senza elenco (o con nomi che non riconosce) usa quelli scritti nell’app', () => {
    expect(pickModels(null, FALLBACK)).toEqual(FALLBACK);
    expect(pickModels([gen('gemini-nuovo-nome')], FALLBACK)).toEqual(FALLBACK);
    expect(LATEST_ALIASES).toContain('gemini-flash-latest');
  });
});
