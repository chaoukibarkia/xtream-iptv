-- Add new settings for curl-based source checker
INSERT INTO "SystemSettings" ("key", "value", "description", "category", "type", "defaultValue") VALUES
('sourceChecker.mode', 'curl', 'Primary source checker mode: ffprobe, curl, or hybrid', 'sourceChecker', 'string', 'curl'),
('sourceChecker.fallbackEnabled', 'true', 'Enable fallback FFprobe checking when curl reports failures', 'sourceChecker', 'boolean', 'true'),
('curlSourceChecker.enabled', 'true', 'Enable curl-based source status checker', 'sourceChecker', 'boolean', 'true'),
('curlSourceChecker.intervalMinutes', '30', 'Check interval in minutes for curl checker', 'sourceChecker', 'integer', '30'),
('curlSourceChecker.batchSize', '20', 'Batch size for curl source checking', 'sourceChecker', 'integer', '20'),
('curlSourceChecker.useContentValidation', 'false', 'Enable content validation (slower but more accurate)', 'sourceChecker', 'boolean', 'false'),
('curlSourceChecker.maxConcurrentChecks', '10', 'Maximum concurrent curl checks', 'sourceChecker', 'integer', '10')
ON CONFLICT ("key") DO NOTHING;

-- Update default sourceChecker configuration to use curl by default
UPDATE "SystemSettings" 
SET "value" = 'curl', "description" = 'Primary source checker mode: ffprobe, curl, or hybrid'
WHERE "key" = 'sourceChecker.enabled';