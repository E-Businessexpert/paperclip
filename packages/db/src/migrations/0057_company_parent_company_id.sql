ALTER TABLE "companies"
ADD COLUMN "parent_company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "companies_parent_company_id_idx" ON "companies" ("parent_company_id");
