SimIA v3.4 — Scheduler engine

What this update adds
- New API:
  - functions/api/scenario/run_scheduler.js
- New Instructor control:
  - Run Scheduler
- Scheduler logic:
  - reads currentScenarioId
  - requires scenario status = live
  - calculates elapsed minutes from start_at
  - auto-releases all due activations with release_offset_min <= elapsed
  - publishes them into events
  - updates scenario_injects to released
  - writes scenario_actions logs

Install
1) Add functions/api/scenario/run_scheduler.js
2) Replace instructor.html
3) Commit + Push

Recommended test
1) Reset + seed structured scenario
2) Start Exercise in Instructor
3) Wait until T+ offset is due or use a low T+ activation
4) Press Run Scheduler
5) Verify:
   - events populated
   - player feed updated
   - scenario_injects status = released
