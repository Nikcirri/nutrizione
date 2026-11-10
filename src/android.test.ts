// Controlla i permessi di Health Connect nel progetto Android: l'app deve chiedere solo le letture
// che usa. Il plugin ne dichiara molte di più (anche scritture): ognuna va tolta nel nostro manifest.
// Se un aggiornamento del plugin ne aggiunge una nuova, questo test lo fa notare prima della pubblicazione.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

// ---------- Widget della schermata Home ----------
// I widget non si possono provare sul computer: questi controlli evitano gli errori che su Android
// darebbero "Impossibile caricare il widget" (viste non ammesse, nomi sbagliati, file mancanti).


const RES = '../android/app/src/main/res';
const WIDGET_JAVA = '../android/app/src/main/java/com/nikcirri/nutrizione/widgets';
/** Le sole viste che Android accetta dentro un widget (RemoteViews). */
const REMOTE_VIEWS = ['LinearLayout', 'FrameLayout', 'RelativeLayout', 'TextView', 'ImageView', 'ProgressBar'];

describe('widget della schermata Home', () => {
  const manifest = read('../android/app/src/main/AndroidManifest.xml');
  const widgets = ['calories', 'cigarettes'];

  it('il manifest dichiara i due widget e il ricevitore dei pulsanti', () => {
    expect(manifest).toContain('android:name=".widgets.CaloriesWidget"');
    expect(manifest).toContain('android:name=".widgets.CigaretteWidget"');
    expect(manifest).toMatch(/android:name="\.widgets\.WidgetActionReceiver"\s+android:exported="false"/);
    for (const w of widgets) expect(manifest).toContain(`android:resource="@xml/widget_${w}_info"`);
  });

  it('ogni widget ha la sua descrizione e il suo layout', () => {
    for (const w of widgets) {
      const info = read(`${RES}/xml/widget_${w}_info.xml`);
      expect(info).toContain(`android:initialLayout="@layout/widget_${w}"`);
      expect(info).toContain('android:updatePeriodMillis="0"'); // nessun risveglio a tempo del telefono
      expect(existsSync(new URL(`${RES}/layout/widget_${w}.xml`, import.meta.url))).toBe(true);
    }
  });

  it('i layout usano solo viste ammesse nei widget', () => {
    for (const w of widgets) {
      const xml = read(`${RES}/layout/widget_${w}.xml`).replace(/<!--[\s\S]*?-->/g, '');
      const tags = [...xml.matchAll(/<([A-Za-z.]+)[\s>]/g)].map((m) => m[1]!);
      expect(tags.filter((t) => !REMOTE_VIEWS.includes(t))).toEqual([]);
      expect(xml).toContain('android:id="@android:id/background"');
    }
  });

  it('il codice Java usa solo nomi che esistono nelle risorse', () => {
    const dir = new URL(WIDGET_JAVA + '/', import.meta.url);
    const java = readdirSync(dir)
      .filter((f) => f.endsWith('.java'))
      .map((f) => readFileSync(new URL(f, dir), 'utf8'))
      .join('\n');
    const layouts = widgets.map((w) => read(`${RES}/layout/widget_${w}.xml`)).join('\n');
    const strings = read(`${RES}/values/strings.xml`);
    const missing: string[] = [];
    for (const [, kind, name] of java.matchAll(/(?<![.\w])R\.(id|string|layout)\.(\w+)/g)) {
      const ok =
        kind === 'id'
          ? layouts.includes(`android:id="@+id/${name}"`)
          : kind === 'string'
            ? strings.includes(`<string name="${name}">`)
            : existsSync(new URL(`${RES}/layout/${name}.xml`, import.meta.url));
      if (!ok) missing.push(`R.${kind}.${name}`);
    }
    expect(missing).toEqual([]);
  });

  it('colori, misure e disegni usati dai widget esistono (anche nel tema scuro)', () => {
    const files = [
      ...widgets.map((w) => `${RES}/layout/widget_${w}.xml`),
      ...readdirSync(new URL(`${RES}/drawable/`, import.meta.url))
        .filter((f) => f.includes('widget'))
        .map((f) => `${RES}/drawable/${f}`),
    ];
    const all = files.map(read).join('\n');
    const colors = read(`${RES}/values/colors.xml`);
    const night = read(`${RES}/values-night/colors.xml`);
    const missing: string[] = [];
    for (const [, name] of all.matchAll(/@color\/(\w+)/g)) {
      if (!colors.includes(`<color name="${name}">`) || !night.includes(`<color name="${name}">`)) missing.push(`color/${name}`);
    }
    for (const [, name] of all.matchAll(/@drawable\/(\w+)/g)) {
      if (!existsSync(new URL(`${RES}/drawable/${name}.xml`, import.meta.url))) missing.push(`drawable/${name}`);
    }
    for (const [, name] of all.matchAll(/@string\/(\w+)/g)) {
      if (!read(`${RES}/values/strings.xml`).includes(`<string name="${name}">`)) missing.push(`string/${name}`);
    }
    for (const [, name] of all.matchAll(/@dimen\/(\w+)/g)) {
      if (!read(`${RES}/values/dimens.xml`).includes(`<dimen name="${name}">`)) missing.push(`dimen/${name}`);
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
