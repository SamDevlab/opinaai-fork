CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS locations_tenant_name_idx
  ON locations(tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  location_id INT REFERENCES locations(id) ON DELETE SET NULL,
  active_survey_id INT REFERENCES surveys(id) ON DELETE SET NULL,
  device_id VARCHAR(80) UNIQUE NOT NULL,
  device_secret_hash CHAR(64) NOT NULL,
  activation_code VARCHAR(6),
  activation_expires_at TIMESTAMPTZ,
  name VARCHAR(160) NOT NULL DEFAULT 'Tablet aguardando pareamento',
  status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK(status IN ('online','offline','unknown')),
  active BOOLEAN NOT NULL DEFAULT true,
  app_version VARCHAR(40),
  last_seen_at TIMESTAMPTZ,
  paired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS devices_unpaired_activation_code_idx
  ON devices(activation_code)
  WHERE tenant_id IS NULL AND activation_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_tenant_idx ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS devices_last_seen_idx ON devices(last_seen_at DESC);

ALTER TABLE responses ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS submission_id VARCHAR(80);
ALTER TABLE responses ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS responses_submission_id_idx
  ON responses(submission_id)
  WHERE submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS responses_device_date_idx ON responses(device_id, created_at);
