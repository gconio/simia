SimIA v3.3.3 — Fix publish to player feed

Confirmed root cause
- Release now was not populating events
- Player feed reads only from events
- The issue was a mismatch between SQL placeholders and bind parameters

Fix
- functions/api/scenario/control.js now uses:
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)

Install
1) Replace functions/api/scenario/control.js
2) Commit + Push

Verification
1) Use Release now on an activation with audience ALL or TEAM:A
2) Check events table
3) Reload player.html?team=A&role=PLAYER&pid=testA1
