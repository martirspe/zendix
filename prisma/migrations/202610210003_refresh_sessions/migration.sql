-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'editor', 'viewer');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'owner';

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefreshSession_tenant_id_user_id_expires_at_idx" ON "RefreshSession"("tenant_id", "user_id", "expires_at");

-- CreateIndex
CREATE INDEX "RefreshSession_tenant_id_family_id_idx" ON "RefreshSession"("tenant_id", "family_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenant_id_id_key" ON "User"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "User"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

