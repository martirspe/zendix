-- CreateTable
CREATE TABLE "ContactView" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB NOT NULL,

    CONSTRAINT "ContactView_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateIndex
CREATE INDEX "ContactView_tenant_id_name_idx" ON "ContactView"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "ContactView" ADD CONSTRAINT "ContactView_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

