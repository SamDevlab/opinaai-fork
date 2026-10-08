ALTER TABLE devices ADD COLUMN IF NOT EXISTS platform VARCHAR(32);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS android_version VARCHAR(32);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(80);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS model VARCHAR(120);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level SMALLINT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS charging BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS network_state VARCHAR(32);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_responses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS kiosk_state VARCHAR(32);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS orientation VARCHAR(16) NOT NULL DEFAULT 'portrait';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS config_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_battery_level_check;
ALTER TABLE devices ADD CONSTRAINT devices_battery_level_check CHECK (battery_level IS NULL OR battery_level BETWEEN 0 AND 100);
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_orientation_check;
ALTER TABLE devices ADD CONSTRAINT devices_orientation_check CHECK (orientation IN ('portrait','landscape','unknown'));
