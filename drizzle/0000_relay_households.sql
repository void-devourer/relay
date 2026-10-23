CREATE TABLE relay_households (
  owner_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);
