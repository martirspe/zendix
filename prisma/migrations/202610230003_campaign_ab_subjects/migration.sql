ALTER TABLE "Campaign"
  ADD COLUMN "subject_variant" TEXT,
  ADD COLUMN "variant_percent" INTEGER;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "campaign_variant_fields_pair_check"
  CHECK (("subject_variant" IS NULL AND "variant_percent" IS NULL) OR ("subject_variant" IS NOT NULL AND "variant_percent" BETWEEN 1 AND 99));
