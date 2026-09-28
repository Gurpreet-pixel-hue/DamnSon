-- Knowledge base (owned by the AI lane). Lives in its own schema, which Prisma does not manage,
-- so pgvector columns, HNSW indexes and generated tsvector columns never show up as drift.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE knowledge.sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url                text NOT NULL UNIQUE CHECK (url LIKE 'https://%'),
  host               text NOT NULL,
  title              text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('portal','form','guideline','fee_schedule','act_or_rule','faq','circular','dataset','other')),
  authority_slug     text,
  is_official        boolean NOT NULL,                  -- isOfficialUrl(url), computed by the ingester
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','blocked','retired')),
  jurisdiction_level text NOT NULL CHECK (jurisdiction_level IN ('national','state','city','local_body','ward')),
  state              text,
  city               text,
  check_every_hours  int NOT NULL DEFAULT 168,
  last_checked_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge.source_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    uuid NOT NULL REFERENCES knowledge.sources(id) ON DELETE CASCADE,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  mime_type    text NOT NULL,
  etag         text,
  storage_path text,                                   -- raw snapshot in Supabase Storage (optional in H48)
  is_current   boolean NOT NULL DEFAULT true,
  UNIQUE (source_id, content_hash)
);
CREATE UNIQUE INDEX source_versions_one_current ON knowledge.source_versions (source_id) WHERE is_current;

CREATE TABLE knowledge.chunks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_version_id uuid NOT NULL REFERENCES knowledge.source_versions(id) ON DELETE CASCADE,
  ordinal           int NOT NULL,
  section_path      text,
  text              text NOT NULL,
  language          text NOT NULL CHECK (language IN ('en','hi','mr')),
  embedding         extensions.vector(768),
  embedding_model   text,                              -- e.g. 'gemini-embedding-2@768'
  tsv               tsvector GENERATED ALWAYS AS (
                      setweight(to_tsvector('simple', coalesce(section_path, '')), 'A') ||
                      setweight(to_tsvector('simple', text), 'B')) STORED,
  UNIQUE (source_version_id, ordinal)
);
CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX chunks_tsv_gin ON knowledge.chunks USING gin (tsv);

-- Hybrid retrieval: full-text + dense, fused with reciprocal rank fusion (k = 60).
CREATE OR REPLACE FUNCTION knowledge.search_chunks(
  q_text        text,
  q_embedding   extensions.vector(768),
  p_state       text,
  p_city        text,
  p_scope_urls  text[] DEFAULT NULL,
  p_limit       int DEFAULT 20)
RETURNS TABLE (chunk_id uuid, source_url text, source_title text, chunk_text text, rrf double precision)
LANGUAGE sql STABLE
SET search_path = knowledge, extensions, pg_catalog
AS $$
  WITH eligible AS (
    SELECT c.id, c.embedding, c.tsv, c.text AS body, s.url, s.title
    FROM chunks c
    JOIN source_versions v ON v.id = c.source_version_id AND v.is_current
    JOIN sources s ON s.id = v.source_id AND s.is_official AND s.status = 'active'
    WHERE (s.jurisdiction_level = 'national'
           OR (s.jurisdiction_level = 'state' AND s.state = p_state)
           OR (s.state = p_state AND s.city = p_city))
      AND (p_scope_urls IS NULL OR s.url = ANY (p_scope_urls))
  ),
  lex AS (
    SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, websearch_to_tsquery('simple', q_text)) DESC, id) AS r
    FROM eligible
    WHERE tsv @@ websearch_to_tsquery('simple', q_text)
    ORDER BY r LIMIT p_limit
  ),
  den AS (
    SELECT id, row_number() OVER (ORDER BY embedding <=> q_embedding, id) AS r
    FROM eligible
    WHERE embedding IS NOT NULL
    ORDER BY r LIMIT p_limit
  ),
  fused AS (
    SELECT id, sum(1.0 / (60 + r))::double precision AS rrf
    FROM (SELECT id, r FROM lex UNION ALL SELECT id, r FROM den) u
    GROUP BY id
  )
  SELECT f.id, e.url, e.title, e.body, f.rrf
  FROM fused f JOIN eligible e USING (id)
  ORDER BY f.rrf DESC, f.id
  LIMIT p_limit;
$$;

ALTER TABLE knowledge.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.chunks ENABLE ROW LEVEL SECURITY;
