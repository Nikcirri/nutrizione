// Controlla i permessi di Health Connect nel progetto Android: l'app deve chiedere solo le letture
// che usa. Il plugin ne dichiara molte di più (anche scritture): ognuna va tolta nel nostro manifest.
// Se un aggiornamento del plugin ne aggiunge una nuova, questo test lo fa notare prima della pubblicazione.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Le sole letture che servono all'app (vedi READ_TYPES in src/lib/services/health.ts). */
const ALLOWED = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  'android.permission.health.READ_EXERCISE',
];

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function healthPermissions(xml: string, removed: boolean): Set<string> {
  const out = new Set<string>();
  for (const tag of xml.match(/<uses-permission\b[^>]*>/g) ?? []) {
    const name = /android:name="([^"]+)"/.exec(tag)?.[1];
    if (!name?.startsWith('android.permission.health.')) continue;
    if (/tools:node="remove"/.test(tag) === removed) out.add(name);
  }
  return out;
}

describe('permessi di Health Connect', () => {
  const plugin = healthPermissions(read('../node_modules/@capgo/capacitor-health/android/src/main/AndroidManifest.xml'), false);
  const app = read('../android/app/src/main/AndroidManifest.xml');
  const removed = healthPermissions(app, true);
  const added = healthPermissions(app, false);

  it('il plugin dichiara le letture che servono', () => {
    for (const p of ALLOWED) expect(plugin.has(p) || added.has(p), p).toBe(true);
  });

  it('ogni permesso in più del plugin è tolto', () => {
    const missing = [...plugin].filter((p) => !ALLOWED.includes(p) && !removed.has(p));
    expect(missing).toEqual([]);
  });

  it('non si tolgono le letture che servono', () => {
    expect(ALLOWED.filter((p) => removed.has(p))).toEqual([]);
  });

  it('ogni permesso tolto esiste davvero nel plugin (niente nomi sbagliati)', () => {
    expect([...removed].filter((p) => !plugin.has(p))).toEqual([]);
  });

  it("l'app non aggiunge permessi di Health Connect oltre a quelli ammessi", () => {
    expect([...added].filter((p) => !ALLOWED.includes(p))).toEqual([]);
  });
});
