ALTER TABLE "Domain" RENAME COLUMN "lockdown_verified" TO "ses_verified";
UPDATE "Domain" SET "ses_verified" = false, "spf_verified" = false, "dkim_verified" = false, "checked_at" = NULL;
ALTER TABLE "EmailDispatch" ALTER COLUMN "provider" SET DEFAULT 'ses';
