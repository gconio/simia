IntelSim v2.4 — Team Mode + Timeline + Instructor Broadcast + Phase

UPLOAD
- Estrai e carica tutto su Cloudflare Pages (root + assets/).

NOVITÀ
1) Timeline: /timeline.html
   - vista unificata Attivazioni+Tasking, filtri, ricerca, stato Released/Pending, team-aware.

2) Phase (GREEN/AMBER/RED)
   - visibile in alto su tutte le pagine (pill PHASE).
   - controllabile da /instructor.html (card Phase).
   - incluso nel Session Pack.

3) Instructor Broadcast
   - /instructor.html → card Broadcast
   - invia un inject TEAM=ALL (visibile a tutti) nel Feed/Timeline.

NOTE TEAM
- team=ALPHA vede ALPHA + ALL (broadcast)
- team=ALL vede tutto
4) White Cell / Control Log (Instructor)
- /instructor.html → sezione "White Cell / Control Log"
- Undo ultimo inject
- Elimina inject specifico
- Export log inject (JSON)
- Svuota log inject

PATCH v2.6
- Fix HTML header (Dashboard link tag) che rompeva il layout.

PATCH v2.7
- Layout safeguard: banner di warning + link fallback se l'HTML è malformato o incompleto.

PATCH v2.8
- Admin → Health Check: test automatici su asset/pagine + validazione JSON.

PATCH v2.9
- Health Check: route probes (/admin,/feed,/timeline) + ispezione _redirects + redirect manual probes.

PATCH v3.0
- app.js riscritto e stabilizzato: Instructor (White Cell) + Admin (Health Check) funzionanti.

PATCH v3.1
- Link interni aggiornati a URL canonici (/, /feed, /admin, ...): niente redirect su navigazione.
- Health Check: considera redirect come WARN solo sugli asset (/assets/*). Pagine canoniche testate senza .html.
