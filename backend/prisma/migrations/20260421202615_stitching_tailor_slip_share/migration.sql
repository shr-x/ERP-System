-- CreateTable
CREATE TABLE "StitchingTailorSlipShareLink" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchingTailorSlipShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StitchingTailorSlipShareLink_token_key" ON "StitchingTailorSlipShareLink"("token");

-- CreateIndex
CREATE INDEX "StitchingTailorSlipShareLink_orgId_idx" ON "StitchingTailorSlipShareLink"("orgId");

-- CreateIndex
CREATE INDEX "StitchingTailorSlipShareLink_orderId_idx" ON "StitchingTailorSlipShareLink"("orderId");

-- AddForeignKey
ALTER TABLE "StitchingTailorSlipShareLink" ADD CONSTRAINT "StitchingTailorSlipShareLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
