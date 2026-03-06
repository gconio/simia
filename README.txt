SimIA v2.4 — Activations phase-select + timeline board

What this update adds
- activations_admin.html now loads phases from the DB
- Phase field is no longer free text; it is a select populated from /api/scenario/phases
- New Timeline Board at the top:
  - columns by phase
  - activations grouped within each phase
  - ordered by T+ minutes

Files included
- activations_admin.html
- README.txt

Prerequisites
- /api/scenario/phases already installed
- /api/scenario/injects already installed
- /api/scenario/actions already installed
- branding.js already installed

Install
1) Replace activations_admin.html
2) Commit + Push
