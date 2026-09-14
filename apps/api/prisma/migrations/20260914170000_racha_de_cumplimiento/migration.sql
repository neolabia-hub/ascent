-- La racha de la empresa: dias seguidos con cero vencidos (PENDIENTES 8.3).
CREATE TABLE IF NOT EXISTS "tenant_compliance_streaks" (
    "tenant_id" UUID NOT NULL,
    "current_days" INTEGER NOT NULL DEFAULT 0,
    "longest_days" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" DATE,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_compliance_streaks_pkey" PRIMARY KEY ("tenant_id")
);
