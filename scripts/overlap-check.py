# Controllo grafico: cerca scritte che si sovrappongono, che escono dallo schermo o dal loro riquadro,
# girando da solo per tutte le schermate dell'app con nomi di alimenti molto lunghi.
#
# Come si usa (serve Python con Playwright e Chrome; non fa parte di `npm run verify`):
#   npm run build && npx vite preview --port 4173 --strictPort &
#   python3 scripts/overlap-check.py 384
#   python3 scripts/overlap-check.py 360
# Argomenti: LARGHEZZA dello schermo in pixel CSS (384 è il telefono dell'utente; provare anche 360 e 320),
# poi (facoltativi, in qualsiasi ordine) `shot` per salvare le schermate in /tmp e l'ingrandimento
# dei caratteri (1.15 = caratteri del telefono più grandi).
# Esce con errore se trova un problema o se un passo non riesce.
# Chrome: variabile CHROME (se manca: /usr/bin/google-chrome). Indirizzo: variabile APP_URL.
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 384
EXTRA = sys.argv[2:]
SHOT = 'shot' in EXTRA
ZOOM = next((float(a) for a in EXTRA if re.fullmatch(r'\d+(\.\d+)?', a)), 1.0)
KEEP = ['diario pieno', 'ricerca "tonno"', 'i miei alimenti', 'dettaglio alimento lungo', 'foto AI · risultato', 'dettaglio Olio extravergine', 'dettaglio Tonno', 'dettaglio Pasta', 'i tuoi piatti', 'modifica voce', 'onboarding piano']

DETECT = r"""
() => {
  const vw = innerWidth, vh = innerHeight;
  const items = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || el.closest('.sr, script, style, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const clips = [];
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') clips.push(p.getBoundingClientRect());
    }
    for (const raw of range.getClientRects()) {
      let r = { left: raw.left, right: raw.right, top: raw.top, bottom: raw.bottom };
      for (const c of clips) r = { left: Math.max(r.left, c.left), right: Math.min(r.right, c.right), top: Math.max(r.top, c.top), bottom: Math.min(r.bottom, c.bottom) };
      r.width = r.right - r.left; r.height = r.bottom - r.top;
      if (r.width < 3 || r.height < 6) continue;
      if (r.bottom <= 0 || r.top >= vh) continue;
      const cx = Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2));
      const cy = Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2));
      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      const svg = el.closest('svg');
      const visible = el === top || el.contains(top) || top.contains(el) || (svg && svg.contains(top));
      if (!visible) continue;
      items.push({ el, text: text.slice(0, 36), l: r.left, r: r.right, t: r.top + r.height * 0.28, b: r.bottom - r.height * 0.22 });
    }
  }
  const out = new Set();
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.l < -1 || a.r > vw + 1) out.add(`FUORI SCHERMO "${a.text}" (${Math.round(a.l)}..${Math.round(a.r)} di ${vw})`);
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (a.el === b.el) continue;
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w > 3 && h > 2) out.add(`SOVRAPPOSTI "${a.text}" × "${b.text}"`);
    }
  }
  // Scritte più larghe del riquadro che le contiene (parole lunghe che non vanno a capo).
  for (const a of items) {
    let box = a.el;
    while (box && getComputedStyle(box).display === 'inline') box = box.parentElement;
    if (!box || box.closest('svg')) continue;
    const cs = getComputedStyle(box);
    if (cs.overflowX !== 'visible') continue; // tagliate apposta (puntini)
    const e = box.getBoundingClientRect();
    if (a.r > e.right + 2 || a.l < e.left - 2) out.add(`ESCE DAL RIQUADRO "${a.text}" (scritta ${Math.round(a.l)}..${Math.round(a.r)}, riquadro ${Math.round(e.left)}..${Math.round(e.right)})`);
  }
  return [...out];
}
"""

LONG = 'Zucchine, zucca al forno, fagioli con salsiccia e pane con patè di fegato'
FAKE = {"dish": LONG, "portion": "abbondante", "confidence": "media",
        "why": "Quasi metà delle calorie arriva dalla salsiccia e dall'olio extravergine usato per condire le verdure al forno.",
        "note": "Olio stimato a occhio; il patè potrebbe essere di più.",
        "items": [{"name": "Zucchine grigliate con olio extravergine d'oliva", "grams": 180, "kcal": 170, "carbs": 6, "protein": 4, "fat": 14, "fiber": 3},
                  {"name": "Fagioli cannellini in umido con salsiccia", "grams": 250, "kcal": 465, "carbs": 32, "protein": 25, "fat": 22, "fiber": 9},
                  {"name": "Pane toscano con patè di fegatini", "grams": 80, "kcal": 262, "carbs": 35, "protein": 9, "fat": 9, "fiber": 2}],
        "questions": [{"question": "Le verdure erano condite con tanto olio oppure poco?", "options": [{"label": "Olio normale", "factor": 1}, {"label": "Tanto olio extravergine", "factor": 1.15}, {"label": "Quasi senza olio", "factor": 0.85}]},
                      {"question": "Hai bevuto qualcosa insieme?", "options": [{"label": "Acqua", "factor": 1}, {"label": "Un bicchiere di vino rosso", "factor": 1, "add": {"name": "Vino rosso", "grams": 150, "kcal": 128, "carbs": 4, "protein": 0, "fat": 0, "fiber": 0}}]}]}
CIG_SEED = """
(() => {
  if (localStorage.getItem('nutrizione.cigarettes')) return;
  const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const days = {};
  [13, 17, 18, 16, 19, 17, 18, 20, 21, 19, 22, 20, 21, 23, 22, 19, 24, 22, 21, 23, 25, 22].forEach((n, i) => { const d = new Date(); d.setDate(d.getDate() - i); days[key(d)] = n; });
  localStorage.setItem('nutrizione.cigarettes', JSON.stringify(days));
})();
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': WIDTH, 'height': 800}, device_scale_factor=2, color_scheme='dark', locale='it-IT')
        page = await ctx.new_page()
        page.set_default_timeout(6000)
        errors, found, steps = [], {}, []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.add_init_script(CIG_SEED)
        if ZOOM != 1.0:
            # Caratteri più grandi, come con "Dimensione carattere" alta nelle impostazioni del telefono.
            await page.add_init_script(f"document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '{ZOOM * 100}%')")
        async def gem(route):
            body = json.loads(route.request.post_data or '{}')
            parts = body.get('contents', [{}])[0].get('parts', [])
            txt = parts[-1].get('text', '') if parts else ''
            if 'Rispondi solo: ok' in txt:
                await route.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}))
                return
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(FAKE)}]}}]}))
        await page.route('https://generativelanguage.googleapis.com/**', gem)
        await page.route('https://api.github.com/**', lambda r: r.fulfill(status=404, body='{}'))
        await page.route('https://search.openfoodfacts.org/**', lambda r: r.abort())
        await page.route('https://world.openfoodfacts.org/**', lambda r: r.abort())

        n = 0
        async def scan(tag):
            nonlocal n
            await page.wait_for_timeout(350)
            # I messaggi a comparsa coprono per qualche secondo il fondo dello schermo: si aspetta che spariscano.
            for _ in range(30):
                if not await page.locator('.toast').count(): break
                await page.wait_for_timeout(250)
            steps.append(tag)
            if SHOT and any(k in tag for k in KEEP):
                slug = re.sub(r'[^a-z0-9]+', '-', tag.lower()).strip('-')[:40]
                await page.screenshot(path=f'/tmp/ov-{WIDTH}-{len(steps):03d}-{slug}.png')
            res = await page.evaluate(DETECT)
            if res:
                n += 1
                found[tag] = res
                if SHOT:
                    await page.screenshot(path=f'/tmp/overlap-{WIDTH}-{n:02d}.png')
        async def scan_scroll(loc, tag):
            h = await loc.evaluate('el => [el.scrollHeight, el.clientHeight]')
            pos, i = 0, 0
            while True:
                await loc.evaluate(f'el => el.scrollTo(0, {pos})')
                await scan(f'{tag} · scorrimento {i}')
                if pos + h[1] >= h[0] - 2: break
                pos += int(h[1] * 0.7); i += 1
                if i > 12: break
            await loc.evaluate('el => el.scrollTo(0, 0)')
        async def step(name, fn):
            try:
                await fn()
            except Exception as e:
                lines = [l.strip() for l in str(e).splitlines() if l.strip()]
                errors.append(f'PASSO "{name}": ' + ' | '.join(lines[:3])[:300])
            # Comunque vada, si riparte con tutti i fogli chiusi.
            for _ in range(5):
                if not await page.locator('.sheet').count(): break
                await page.locator('.sheet').last.get_by_role('button', name='Chiudi').first.click()
                await page.wait_for_timeout(250)
        sheet = lambda: page.locator('.sheet').last
        main_el = page.locator('main')

        await page.goto(os.environ.get('APP_URL', 'http://localhost:4173/'))
        await scan('onboarding 0')
        await page.get_by_text('Iniziamo').click()
        for i in range(3):
            await scan(f'onboarding {i + 1}')
            await page.get_by_role('button', name='Continua').click()
        await scan('onboarding piano')
        await page.get_by_text('Inizia a usare l’app').click()
        await page.wait_for_timeout(500)
        await scan_scroll(main_el, 'diario vuoto')

        # ---- aggiungi: ricerca e dettaglio ----
        async def add_food(query, name):
            await page.get_by_role('button', name='Aggiungi un alimento').click()
            await scan(f'aggiungi (menu)')
            await sheet().get_by_placeholder('Cerca un alimento').fill(query)
            await scan_scroll(sheet().locator('.body'), f'ricerca "{query}"')
            await sheet().get_by_role('button', name=name).first.click()
            await scan(f'dettaglio {name}')
            body = sheet().locator('.body')
            sizes_box = sheet().locator('.sizes')
            await sizes_box.scroll_into_view_if_needed()
            for s in ['Piccola', 'Normale', 'Abbondante']:
                await sizes_box.get_by_role('button', name=s).click()
                await body.evaluate('el => el.scrollTo(0, 0)')
                await scan(f'dettaglio {name} · {s}')
            await scan_scroll(body, f'dettaglio {name} · tutto')
            # Le misure dell'alimento (cucchiaio, scatoletta…): si prova l'ultima, la quantità resta la stessa.
            measure = sheet().locator('.measure select')
            options = await measure.locator('option').count()
            if options > 1:
                await measure.select_option(index=options - 1)
                await body.evaluate('el => el.scrollTo(0, 0)')
                await scan(f'dettaglio {name} · misura dell’alimento')
            await sheet().get_by_role('button', name='Aggiungi ·').click()
            await page.wait_for_timeout(400)
            await scan('dopo aggiunta')
            await page.get_by_role('button', name='Fatto').click()
            await page.wait_for_timeout(300)
        for q, nm in [('olio', 'Olio extravergine'), ('tonno', 'Tonno'), ('parmigiano', 'Parmigiano'), ('pasta', 'Pasta di semola (cruda)')]:
            await step(f'aggiungi {q}', lambda q=q, nm=nm: add_food(q, nm))

        # ---- crea alimento con nome lunghissimo ----
        async def create():
            await page.get_by_role('button', name='Aggiungi un alimento').click()
            await sheet().get_by_role('button', name='Crea', exact=True).click()
            await scan('crea alimento')
            s = sheet()
            await s.get_by_label('Nome *').fill(LONG)
            await s.get_by_label('Marca').fill('Trattoria del Buongustaio di Montevarchi')
            for label, v in [('Carboidrati (g) *', '30'), ('Proteine (g) *', '14'), ('Grassi (g) *', '16')]:
                await s.get_by_label(label).fill(v)
            await scan_scroll(s.locator('.body'), 'crea alimento compilato')
            await s.get_by_role('button', name='Salva').click()
            await page.wait_for_timeout(500)
            await page.screenshot(path=f'/tmp/ov-{WIDTH}-dopo-salva.png')
            await scan('dettaglio alimento lungo')
            await sheet().locator('.sizes').get_by_role('button', name='Abbondante').click()
            await sheet().locator('.body').evaluate('el => el.scrollTo(0, 0)')
            await scan('dettaglio alimento lungo · Abbondante')
            await scan_scroll(sheet().locator('.body'), 'dettaglio alimento lungo · tutto')
            await sheet().get_by_role('button', name='Aggiungi ·').click()
            await page.wait_for_timeout(400)
            await scan('ricerca dopo creazione')
            await page.get_by_role('button', name='Fatto').click()
        await step('crea alimento', create)

        # ---- Foto AI con nomi lunghi ----
        async def ai():
            await page.get_by_role('button', name='Aggiungi un alimento').click()
            await sheet().get_by_role('button', name='Foto AI').click()
            await scan('foto AI · chiave')
            await page.get_by_placeholder('AQ.…').fill('AQ.Ab8RN6Jxl6OdplEKqxwlbG2IZ7PNmYabcdefghijkl')
            await page.get_by_role('button', name='Salva la chiave').click()
            await page.wait_for_timeout(500)
            await scan('foto AI · inizio')
            await sheet().locator('textarea').fill('zucchine, zucca al forno, fagioli con salsiccia e pane con patè di fegato')
            await page.get_by_role('button', name='Calcola con l’AI').click()
            await page.wait_for_timeout(1200)
            body = sheet().locator('.body')
            await scan_scroll(body, 'foto AI · risultato')
            await page.get_by_role('button', name='Nascondi dettagli').click()
            await scan_scroll(body, 'foto AI · senza dettagli')
            await page.get_by_role('button', name='Vedi dettagli (ingredienti e grammi)').click()
            await sheet().get_by_role('button', name='Aggiungi a').click()
            await page.wait_for_timeout(800)
            await page.get_by_role('button', name='Aggiungi un alimento').click()
            await sheet().get_by_role('button', name='Foto AI').click()
            await page.wait_for_timeout(600)
            await scan_scroll(sheet().locator('.body'), 'foto AI · i tuoi piatti')
            await sheet().get_by_role('button', name='Chiudi', exact=True).last.click()
            await page.wait_for_timeout(300)
            if await page.get_by_role('button', name='Fatto').count():
                await page.get_by_role('button', name='Fatto').click()
        await step('foto AI', ai)

        # ---- altri fogli ----
        async def quick():
            await page.get_by_role('button', name='Aggiungi un alimento').click()
            await sheet().get_by_role('button', name='Solo kcal').click()
            await scan('solo kcal')
            await sheet().get_by_role('button', name='Chiudi', exact=True).first.click()
            await page.wait_for_timeout(200)
            if await page.get_by_role('button', name='Fatto').count():
                await page.get_by_role('button', name='Fatto').click()
        await step('solo kcal', quick)
        async def activity():
            await main_el.evaluate('el => el.scrollTo(0, 0)')
            await page.get_by_role('button', name='Aggiungi attività').first.click()
            await scan_scroll(sheet().locator('.body'), 'attività')
            await sheet().get_by_role('button', name='Chiudi', exact=True).first.click()
        await step('attività', activity)

        await page.wait_for_timeout(5500)  # i messaggi a comparsa spariscono
        await scan_scroll(main_el, 'diario pieno')

        async def entry():
            row = main_el.get_by_text('Olio extravergine').first
            await row.click()
            await scan_scroll(sheet().locator('.body'), 'modifica voce del diario')
            await sheet().get_by_role('button', name='Chiudi', exact=True).first.click()
        await step('voce del diario', entry)

        # ---- le altre schede ----
        async def digiuno():
            await page.get_by_role('button', name='Digiuno', exact=True).click()
            await scan_scroll(main_el, 'digiuno')
            await page.get_by_role('button', name='Inizia ora').click()
            await scan_scroll(main_el, 'digiuno in corso')
        await step('digiuno', digiuno)
        async def progressi():
            await page.get_by_role('button', name='Progressi', exact=True).click()
            for r in ['7 giorni', '14 giorni', '30 giorni']:
                await page.get_by_role('button', name=r).first.click()
                await scan(f'progressi {r}')
            await scan_scroll(main_el, 'progressi')
            await page.get_by_role('button', name='Nuova pesata').click()
            await scan('pesata')
            await sheet().get_by_role('button', name='Annulla').click()
            await main_el.evaluate('el => el.scrollTo(0, el.scrollHeight)')
            await page.locator('button.cig').click()
            for r in ['7 giorni', '14 giorni', '30 giorni']:
                await sheet().get_by_role('button', name=r).click()
                await scan(f'sigarette {r}')
            await scan_scroll(sheet().locator('.body'), 'sigarette')
            await sheet().get_by_role('button', name='Chiudi', exact=True).last.click()
        await step('progressi', progressi)
        async def profilo():
            await page.get_by_role('button', name='Profilo', exact=True).click()
            await scan_scroll(main_el, 'profilo')
            await page.get_by_text('I miei alimenti').first.click()
            await scan_scroll(sheet().locator('.body'), 'i miei alimenti')
        await step('profilo', profilo)

        print(f'--- larghezza {WIDTH}, caratteri {round(ZOOM * 100)}%: {len(steps)} schermate controllate')
        for tag, res in found.items():
            print(f'[{tag}]')
            for r in res: print('   ', r)
        print('ERRORI', errors)
        await b.close()
        return 1 if found or errors else 0
sys.exit(asyncio.run(main()))
