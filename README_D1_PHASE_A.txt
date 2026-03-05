IntelSim v3.2.7-d1A — D1 (Phase A) Teams + Participants + Invites (invio assistito)

COSA C'E' DI NUOVO
- Admin: card "Database" con stato DB (chiama /api/health).
- Admin: gestione partecipanti su DB (crea/aggiorna team e ruolo, elimina).
- Admin: sezione "Invites / Export" (CSV/JSON) e bottoni "Copia link / Copia email" per ogni partecipante.
- Teams: "Salva" prova a scrivere su D1; fallback a localStorage se DB non disponibile.

SETUP CLOUDFLARE
1) Crea un DB D1 (es. intelsim-db)
2) Esegui migration SQL:
   /migrations/001_init.sql  (incolla in D1 → Execute SQL)
3) Pages → Settings → Functions → D1 database bindings
   - Binding name: DB
   - Database: seleziona il DB
4) Deploy su Pages (upload dello ZIP)

TEST
- /api/health deve rispondere con dbBound:true e dbOk:true
- Admin → Database: deve mostrare "DB OK"
- Admin → Teams: Salva
- Admin → Participants (DB): aggiungi, assegna team/ruolo, salva

NOTE
- Se /api/health fallisce: probabilmente le Functions non sono state deployate.
  Verifica che nel progetto siano presenti /functions/api/*.js.
