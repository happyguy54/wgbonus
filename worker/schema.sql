-- wgbonus shared store - D1 schema
-- Paste this into the D1 database's console once (see worker/README.md).

CREATE TABLE IF NOT EXISTS attacks (
  id               TEXT PRIMARY KEY,
  cas              TEXT,
  typ              TEXT,
  cil_id           INTEGER,
  cil_zeme         TEXT,
  cil_aliance      TEXT,
  cil_hrac         TEXT,
  zabito_vojaci    INTEGER,
  zabito_tanky     INTEGER,
  zabito_stihacky  INTEGER,
  zabito_bunkry    INTEGER,
  zabito_celkem    INTEGER,
  zakladny         INTEGER,
  ztraty_utocnik   INTEGER,
  ztraty_obrance   INTEGER,
  xp               INTEGER,
  prestiz_utocnik  INTEGER,
  prestiz_obrance  INTEGER,
  hodnost_utocnik  INTEGER,
  hodnost_obrance  INTEGER,
  raw              TEXT,
  vlozeno          TEXT
);

CREATE INDEX IF NOT EXISTS attacks_typ  ON attacks (typ);
CREATE INDEX IF NOT EXISTS attacks_cas  ON attacks (cas);
CREATE INDEX IF NOT EXISTS attacks_cil  ON attacks (cil_id);

CREATE TABLE IF NOT EXISTS konflikty (
  id               TEXT PRIMARY KEY,
  cas              TEXT,
  typ              TEXT,
  utocnik_id       INTEGER,
  obrance_id       INTEGER,
  obrance_aliance  TEXT,
  prestiz_utocnik  INTEGER,
  prestiz_obrance  INTEGER,
  zakladny         INTEGER,
  jednotky         INTEGER,
  vlozeno          TEXT
);

-- The join onto attacks happens on defender + minute, so index both.
CREATE INDEX IF NOT EXISTS konflikty_cas ON konflikty (cas);
CREATE INDEX IF NOT EXISTS konflikty_obr ON konflikty (obrance_id);
