-- CreateTable
CREATE TABLE "ContactField" (
    "tenant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ContactField_pkey" PRIMARY KEY ("tenant_id","key")
);

-- AddForeignKey
ALTER TABLE "ContactField" ADD CONSTRAINT "ContactField_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

