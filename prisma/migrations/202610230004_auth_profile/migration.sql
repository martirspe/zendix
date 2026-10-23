ALTER TABLE "User"
  ADD COLUMN "first_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "last_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "terms_accepted_at" TIMESTAMP(3);

CREATE TABLE "AuthChallenge" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthChallenge_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AuthChallenge_tenant_id_email_purpose_created_at_idx" ON "AuthChallenge"("tenant_id", "email", "purpose", "created_at");
CREATE INDEX "AuthChallenge_tenant_id_expires_at_idx" ON "AuthChallenge"("tenant_id", "expires_at");
