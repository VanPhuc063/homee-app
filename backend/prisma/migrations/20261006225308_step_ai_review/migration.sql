-- CreateTable
CREATE TABLE "StepAiReview" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepAiReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StepAiReview_stepId_key" ON "StepAiReview"("stepId");

-- AddForeignKey
ALTER TABLE "StepAiReview" ADD CONSTRAINT "StepAiReview_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

