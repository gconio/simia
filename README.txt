SimIA v2.6 — Timeline shift + phase clamp control

What this update adds
- New White Cell action:
  - Shift subsequent +5
- Existing delay action is now explicit:
  - Delay only +5
- Phase boundary control on time changes:
  - if an activation would fall outside its own phase,
    it is automatically clamped inside the phase
  - clamp target:
    - last activation time already present in that phase
    - otherwise the last useful minute of the phase

Files included
- functions/api/scenario/control.js
- activations_admin.html
- README.txt

Install
1) Copy files preserving folders
2) Commit + Push
