CREATE TYPE "EmailProvider" AS ENUM ('mailchannels', 'ses');
CREATE TYPE "ProviderEventStatus" AS ENUM ('received', 'processed', 'failed');

ALTER TABLE "EmailDispatch" ADD COLUMN "provider" "EmailProvider" NOT NULL DEFAULT 'mailchannels';

CREATE TABLE "EmailProviderAccount" (
    "tenant_id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "account_handle" TEXT NOT NULL,
    "webhook_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_provider_accounts_pkey" PRIMARY KEY ("tenant_id", "provider"),
    CONSTRAINT "email_provider_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "email_provider_accounts_provider_account_handle_key" ON "EmailProviderAccount"("provider", "account_handle");

CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "account_handle" TEXT NOT NULL,
    "request_id" TEXT,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ProviderEventStatus" NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_webhook_events_tenant_id_provider_event_id_key" ON "ProviderWebhookEvent"("tenant_id", "provider_event_id");
CREATE INDEX "provider_webhook_events_tenant_id_status_created_at_idx" ON "ProviderWebhookEvent"("tenant_id", "status", "created_at");
CREATE INDEX "provider_webhook_events_tenant_id_provider_request_id_idx" ON "ProviderWebhookEvent"("tenant_id", "provider", "request_id");
ALTER TABLE "EmailDispatch"
  ADD COLUMN "recipient" TEXT,
  ADD COLUMN "from_email" TEXT,
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "html" TEXT;
CREATE INDEX "email_dispatches_tenant_id_provider_provider_id_idx" ON "EmailDispatch"("tenant_id", "provider", "provider_id");
ALTER TABLE "EmailDispatch"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
