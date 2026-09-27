-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('draft', 'in_review', 'published', 'superseded', 'rejected');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('citizen', 'officer', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('wrong_fee', 'wrong_document', 'broken_link', 'outdated', 'wrong_order', 'request', 'copilot_error', 'other');

-- CreateTable
CREATE TABLE "approval_modules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authority_slug" TEXT NOT NULL,
    "published_version_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_module_versions" (
    "id" UUID NOT NULL,
    "module_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,

    CONSTRAINT "approval_module_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_revision_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journey_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_template_revisions" (
    "id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,

    CONSTRAINT "journey_template_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "template_id" TEXT,
    "step_id" TEXT,
    "revision" INTEGER,
    "message" VARCHAR(1000),
    "ip_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "actor_role" "Role",
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_hash" TEXT,
    "after_hash" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_modules_published_version_id_key" ON "approval_modules"("published_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_module_versions_module_id_version_key" ON "approval_module_versions"("module_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "journey_templates_published_revision_id_key" ON "journey_templates"("published_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "journey_template_revisions_template_id_revision_key" ON "journey_template_revisions"("template_id", "revision");

-- AddForeignKey
ALTER TABLE "approval_module_versions" ADD CONSTRAINT "approval_module_versions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "approval_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_template_revisions" ADD CONSTRAINT "journey_template_revisions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "journey_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-added guards (PRD Appendix A.3). Prisma does not model triggers, functions,
-- partial unique indexes on status or RLS, so later schema diffs leave these alone.
-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-added to the first Prisma migration (created with `prisma migrate dev --create-only`).
-- Prisma does not model triggers, functions, CHECK constraints or RLS, so later diffs leave them alone.

-- Published content is immutable; published and superseded rows are never deleted.
CREATE FUNCTION forbid_published_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'superseded') THEN
      RAISE EXCEPTION 'published content cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('published', 'superseded') AND
     (NEW.content IS DISTINCT FROM OLD.content OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'published content is immutable; create a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER modules_immutable BEFORE UPDATE OR DELETE ON approval_module_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_change();
CREATE TRIGGER templates_immutable BEFORE UPDATE OR DELETE ON journey_template_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_change();

-- At most one draft per module and per template.
CREATE UNIQUE INDEX one_draft_per_module ON approval_module_versions (module_id) WHERE status = 'draft';
CREATE UNIQUE INDEX one_draft_per_template ON journey_template_revisions (template_id) WHERE status = 'draft';

-- Audit log is append-only.
CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();

-- Deny-by-default for Supabase's Data API: RLS on, no policies. The BFF connects as the table
-- owner through Prisma, which bypasses RLS; anon/authenticated keys can read nothing.
ALTER TABLE approval_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_template_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE _prisma_migrations ENABLE ROW LEVEL SECURITY;
