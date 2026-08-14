ALTER TABLE production_parts
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN production_parts.enabled IS
    'Operator-controlled Sequence inclusion. Disabled Parts remain editable and recoverable but are excluded from preview and export.';
