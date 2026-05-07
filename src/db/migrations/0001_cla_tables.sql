-- CLA signers: users who have signed the Contributor License Agreement
CREATE TABLE IF NOT EXISTS cla_signers (
  github_username TEXT PRIMARY KEY
);

-- CLA pending signers: users who need to sign the CLA
CREATE TABLE IF NOT EXISTS cla_pending_signers (
  github_username TEXT PRIMARY KEY,
  commits TEXT NOT NULL,  -- JSON array of commit SHAs
  pr TEXT NOT NULL,       -- e.g. "home-assistant/core#12345"
  repository_owner TEXT NOT NULL,
  repository TEXT NOT NULL,
  pr_number TEXT NOT NULL,
  signature_requested_at TEXT NOT NULL
);
