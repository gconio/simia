SimIA v2.5 — White Cell controls inside Activations

What this update adds
- New API:
  - /api/scenario/control
- White Cell actions now available inside Activations:
  - Release now
  - Delay +5 min
  - Cancel
  - Retarget
- Actions available:
  - in activation list
  - in timeline board cards

Files included
- functions/api/scenario/control.js
- activations_admin.html
- README.txt

Prerequisites
- /api/scenario/phases installed
- /api/scenario/injects installed
- /api/scenario/actions installed
- branding.js installed

Install
1) Copy files preserving folders
2) Commit + Push

Checks
A) Open /activations_admin.html
B) Use Release now on an activation
C) Use Delay +5
D) Use Cancel
E) Use Retarget
F) Verify White Cell Log updates
