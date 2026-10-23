ALTER TABLE "User" ADD COLUMN "google_sub" TEXT;

CREATE UNIQUE INDEX "User_tenant_id_google_sub_key" ON "User"("tenant_id", "google_sub");
