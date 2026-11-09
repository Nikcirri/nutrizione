import { describe, expect, it } from 'vitest';
import {
  buildPrompt,
  extractJson,
  geminiProblem,
  geminiText,
  itemPer100,
  looksLikeGeminiKey,
  modelOrder,
  parseAiMeal,
  scaleItem,
  waitingMessage,
} from './ai';

describe('AI: richiesta', () => {
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
    expect(parseAiMeal('{"items":[]}')).toEqual({ dish: 'Piatto', items: [], confidence: 'media', note: '' });
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
  it('prova per primo il modello che ha funzionato', () => {
    const models = ['a', 'b', 'c'];
    expect(modelOrder(models, 'c')).toEqual(['c', 'a', 'b']);
    expect(modelOrder(models, '')).toEqual(['a', 'b', 'c']);
    expect(modelOrder(models, 'vecchio')).toEqual(['a', 'b', 'c']);
  });
  it('messaggi durante l’attesa', () => {
    expect(waitingMessage(1, true)).toBe('Invio la foto…');
    expect(waitingMessage(5, false)).toBe('Leggo la descrizione…');
    expect(waitingMessage(30, true)).toMatch(/più del solito/);
  });
});
