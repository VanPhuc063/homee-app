-- CreateTable
CREATE TABLE "MaterialLogRevision" (
    "id" TEXT NOT NULL,
    "materialLogId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLogRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialLogRevision_materialLogId_idx" ON "MaterialLogRevision"("materialLogId");

