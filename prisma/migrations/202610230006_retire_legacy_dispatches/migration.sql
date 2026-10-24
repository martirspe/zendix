UPDATE "EmailDispatch"
SET "status" = CASE WHEN "status" = 'submitting' THEN 'uncertain' ELSE 'failed' END,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "provider" = 'mailchannels'
  AND "status" IN ('scheduled', 'pending', 'preparing', 'submitting');

UPDATE "Campaign" AS campaign
SET "status" = 'failed'
WHERE campaign."status" IN ('scheduled', 'sending')
  AND EXISTS (
    SELECT 1 FROM "EmailDispatch" AS dispatch
    WHERE dispatch."tenant_id" = campaign."tenant_id"
      AND dispatch."campaign_id" = campaign."id"
      AND dispatch."provider" = 'mailchannels'
  );
