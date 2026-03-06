-- SimIA stable update: app_config for platform-wide settings
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_config (key, value) VALUES ('defaultTheme', 'intel-dark');
