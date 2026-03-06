SimIA v2.3 — Exercise/Phases + Activations split

What this update changes
- exercise_admin.html now contains:
  - Exercise / Scenario
  - real Phases management
- activations_admin.html now becomes the operational management module for activations
- Clear separation between:
  - narrative structure
  - dynamic activations

Files included
- exercise_admin.html
- activations_admin.html
- README.txt

Prerequisites
- /api/scenario/phases already installed
- /api/scenario/injects already installed
- /api/scenario/actions already installed
- branding.js already installed

Install
1) Replace/add files in repo root
2) Commit + Push

Checks
A) Open /exercise_admin.html
   - phases can be created, edited, deleted
B) Open /activations_admin.html
   - activations can be created, edited, deleted
C) Verify no dispersion:
   - phases only in Exercise / Scenario
   - activations only in Activations
