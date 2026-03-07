SimIA v3.3.2 — Publish player feed on Release now

Problem fixed
- White Cell action 'Release now' was only updating scenario_injects.status='released'
- It was NOT publishing an item into events
- Player feed reads from /api/scenario/feed -> events table
- Result: released activations were not visible to players

Fix
- functions/api/scenario/control.js now publishes an event into events
  when Release now is used
- Audience mapping:
  - ALL -> ALL
  - TEAM + A -> TEAM:A
  - ROLE + PLAYER -> ROLE:PLAYER
  - USER + X -> USER:X

Install
1) Replace functions/api/scenario/control.js
2) Commit + Push

Test
1) Open Activations / Monitoring
2) Use Release now on:
   - one activation ALL
   - one activation TEAM:A
3) Open player.html?team=A&role=PLAYER&pid=testA1
4) Feed should populate
