CREATE TABLE "CampaignAudience" (
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    CONSTRAINT "CampaignAudience_pkey" PRIMARY KEY ("tenant_id", "campaign_id", "list_id"),
    CONSTRAINT "CampaignAudience_tenant_id_campaign_id_fkey" FOREIGN KEY ("tenant_id", "campaign_id") REFERENCES "Campaign"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignAudience_tenant_id_list_id_fkey" FOREIGN KEY ("tenant_id", "list_id") REFERENCES "List"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CampaignAudience_tenant_id_list_id_idx" ON "CampaignAudience"("tenant_id", "list_id");