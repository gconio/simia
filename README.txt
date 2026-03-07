SimIA v3.5 — Auto scheduler + phase progression + ALL audience fix

What this update adds
- functions/api/scenario/run_scheduler.js
  - updates current phase automatically based on elapsed time
  - updates scenario_phases statuses: pending / active / closed
  - updates scenarios.current_phase
  - updates simulation_state.current_phase
  - auto-releases due activations into events
- functions/api/scenario/feed.js
  - explicit ALL audience handling
- instructor.html
  - Auto Scheduler ON/OFF toggle
  - scheduler polling every 15 seconds when enabled

Install
1) Replace functions/api/scenario/run_scheduler.js
2) Replace functions/api/scenario/feed.js
3) Replace instructor.html
4) Commit + Push

Recommended test
1) Reset + seed scenario
2) Start Exercise
3) Enable Auto Scheduler
4) Wait for T+ due activations
5) Verify:
   - phases change status/color over time
   - ALL and TEAM:A messages appear in Team A player feed
