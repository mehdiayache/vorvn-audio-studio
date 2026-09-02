-- Origins canonical PostgreSQL baseline.
--
-- Development state is disposable. This schema creates the target domain
-- directly: Workspace, Project, File, FileVersion, Job and creation context.
-- It intentionally contains no retired hierarchy or compatibility bridge.


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_records (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id text,
    organization_id text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    request_id text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: audit_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_records_id_seq OWNED BY public.audit_records.id;


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id bigint NOT NULL,
    script_id bigint NOT NULL,
    "position" integer NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    voice text DEFAULT ''::text NOT NULL,
    model text DEFAULT 'plus'::text NOT NULL,
    language text,
    instruction text,
    rate real DEFAULT 1 NOT NULL,
    pitch real DEFAULT 1 NOT NULL,
    volume integer DEFAULT 100 NOT NULL,
    seed integer DEFAULT 0 NOT NULL,
    audio_file text,
    duration_ms integer,
    size_bytes bigint DEFAULT 0 NOT NULL,
    cost numeric(12,6) DEFAULT 0 NOT NULL,
    rendered_at timestamp with time zone,
    stale boolean DEFAULT true NOT NULL
);


--
-- Name: blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocks_id_seq OWNED BY public.blocks.id;


--
-- Name: budget_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_reservations (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id bigint,
    operation text NOT NULL,
    estimated_cost numeric(12,6) NOT NULL,
    actual_cost numeric(12,6),
    status text DEFAULT 'reserved'::text NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT budget_reservations_estimated_cost_check CHECK ((estimated_cost >= (0)::numeric)),
    CONSTRAINT budget_reservations_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'reconciled'::text, 'released'::text, 'ambiguous'::text])))
);


--
-- Name: budget_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.budget_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: budget_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.budget_reservations_id_seq OWNED BY public.budget_reservations.id;


--
-- Name: capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capabilities (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    controls jsonb DEFAULT '{}'::jsonb NOT NULL,
    ui_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clips (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    part_id bigint NOT NULL,
    source_part_revision integer NOT NULL,
    source_script_hash text NOT NULL,
    voice_identity_id text,
    voice_name_snapshot text,
    reference_id text,
    binding_id uuid,
    catalogue_voice_id text,
    binding_resolution_status text DEFAULT 'resolved'::text NOT NULL,
    capability_id text,
    capability_name_snapshot text,
    provider text,
    provider_region text,
    provider_voice_id text,
    model_id text,
    tier text,
    language text,
    raw_text text,
    spoken_text text,
    tagged_text text,
    delivery jsonb DEFAULT '{}'::jsonb NOT NULL,
    segmentation jsonb DEFAULT '{}'::jsonb NOT NULL,
    usage jsonb DEFAULT '{}'::jsonb NOT NULL,
    cost numeric(12,6) DEFAULT 0 NOT NULL,
    cost_basis text DEFAULT 'unknown'::text NOT NULL,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    filename text DEFAULT ''::text NOT NULL,
    path text DEFAULT ''::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    duration_ms integer,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_attempt_id bigint,
    start_time_ms bigint DEFAULT 0 NOT NULL,
    file_url text DEFAULT ''::text NOT NULL
);


--
-- Name: TABLE clips; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.clips IS 'The single recording File attached to a Speech Part.';


--
-- Name: composer_working_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.composer_working_drafts (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    context_key text NOT NULL,
    context_kind text NOT NULL,
    session_id uuid,
    project_id bigint,
    part_id bigint,
    insert_before_part_public_id uuid,
    state jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT composer_working_drafts_context_check CHECK ((((context_kind = 'standalone'::text) AND (session_id IS NOT NULL) AND (project_id IS NULL) AND (part_id IS NULL) AND (insert_before_part_public_id IS NULL)) OR ((context_kind = 'project'::text) AND (session_id IS NULL) AND (project_id IS NOT NULL) AND ((part_id IS NULL) OR (insert_before_part_public_id IS NULL))))),
    CONSTRAINT composer_working_drafts_context_kind_check CHECK ((context_kind = ANY (ARRAY['standalone'::text, 'project'::text]))),
    CONSTRAINT composer_working_drafts_version_check CHECK ((version > 0))
);


--
-- Name: composer_working_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.composer_working_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: composer_working_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.composer_working_drafts_id_seq OWNED BY public.composer_working_drafts.id;


--
-- Name: composition_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.composition_drafts (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    part_id bigint,
    project_id bigint NOT NULL,
    insert_at integer,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: composition_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.composition_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: composition_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.composition_drafts_id_seq OWNED BY public.composition_drafts.id;


--
-- Name: exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exports (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    filename text NOT NULL,
    manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
    renderer text DEFAULT 'ffmpeg'::text NOT NULL,
    duration_ms integer,
    size_bytes bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: exports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exports_id_seq OWNED BY public.exports.id;


--
-- Name: file_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_versions (
    id bigint NOT NULL,
    file_id bigint NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    filename text NOT NULL,
    path text,
    size_bytes bigint DEFAULT 0 NOT NULL,
    duration_ms integer,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    checksum text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_format text,
    sample_rate integer,
    channels smallint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    media_format text,
    width integer,
    height integer,
    video_codec text,
    frame_rate double precision,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_key text NOT NULL,
    CONSTRAINT file_versions_channels_check CHECK (((channels IS NULL) OR (channels > 0))),
    CONSTRAINT file_versions_frame_rate_check CHECK (((frame_rate IS NULL) OR (frame_rate > (0)::double precision))),
    CONSTRAINT file_versions_height_check CHECK (((height IS NULL) OR (height > 0))),
    CONSTRAINT file_versions_sample_rate_check CHECK (((sample_rate IS NULL) OR (sample_rate > 0))),
    CONSTRAINT file_versions_width_check CHECK (((width IS NULL) OR (width > 0)))
);


--
-- Name: file_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_versions_id_seq OWNED BY public.file_versions.id;


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id bigint NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    media_type text DEFAULT 'audio'::text NOT NULL,
    category text,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    folder_id bigint,
    source text DEFAULT 'uploaded'::text NOT NULL,
    CONSTRAINT files_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['music'::text, 'sfx'::text, 'ambience'::text]))))
);


--
-- Name: files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.files_id_seq OWNED BY public.files.id;


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    parent_id bigint,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: folders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.folders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.folders_id_seq OWNED BY public.folders.id;


--
-- Name: job_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_events (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    progress real,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: job_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_events_id_seq OWNED BY public.job_events.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    model text,
    status text NOT NULL,
    estimated numeric(12,6) DEFAULT 0,
    cost numeric(12,6) DEFAULT 0,
    chars integer DEFAULT 0,
    seconds real DEFAULT 0,
    voice text,
    detail text,
    error text,
    elapsed_ms integer,
    parent_id bigint,
    usage jsonb,
    cost_basis text DEFAULT 'estimate'::text,
    voice_identity_id text,
    provider_voice_id text,
    engine text,
    tier text,
    done integer DEFAULT 0,
    total integer DEFAULT 0,
    project_id bigint,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text,
    actor_id text DEFAULT 'local-owner'::text,
    organization_id text DEFAULT 'local-studio'::text,
    requested_route jsonb DEFAULT '{}'::jsonb NOT NULL,
    resolved_route jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_request_id text,
    provider_region text,
    provider_endpoint text,
    price_version text,
    currency text DEFAULT 'USD'::text NOT NULL,
    output_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    retries integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    cancel_requested boolean DEFAULT false NOT NULL,
    last_heartbeat_at timestamp with time zone,
    operation_label text,
    source_tool text,
    idempotency_fingerprint text,
    part_id bigint,
    clip_id bigint,
    provider_attempt_id bigint,
    workspace_id bigint,
    creation_action_id text,
    creation_preset_id text,
    creation_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    output_file_ids bigint[] DEFAULT '{}'::bigint[] NOT NULL
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: object_file_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_file_usages (
    object_id bigint NOT NULL,
    file_id bigint NOT NULL,
    purpose text DEFAULT 'reference'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objects (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id bigint NOT NULL,
    folder_id bigint,
    object_type text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: objects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.objects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: objects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.objects_id_seq OWNED BY public.objects.id;


--
-- Name: project_file_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_file_usages (
    project_id bigint NOT NULL,
    file_id bigint NOT NULL,
    purpose text DEFAULT 'media'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_parts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_parts (
    project_id bigint NOT NULL,
    "position" integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text DEFAULT 'speech'::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    editorial_status text DEFAULT 'draft'::text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    file_id bigint,
    file_version_id bigint,
    duration_ms integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_position integer,
    enabled boolean DEFAULT true NOT NULL,
    authored_role text,
    CONSTRAINT project_parts_revision_check CHECK ((revision > 0))
);


--
-- Name: COLUMN project_parts.archived_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_parts.archived_position IS 'Sequence position at archive time; never participates in the active sequence.';


--
-- Name: COLUMN project_parts.enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_parts.enabled IS 'Operator-controlled Sequence inclusion. Disabled Parts remain editable and recoverable but are excluded from preview and export.';


--
-- Name: project_parts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_parts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_parts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_parts_id_seq OWNED BY public.project_parts.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id bigint NOT NULL,
    folder_id bigint,
    project_type text DEFAULT 'audiovisual'::text NOT NULL,
    CONSTRAINT projects_project_type_check CHECK ((project_type = 'audiovisual'::text)),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'review'::text, 'approved'::text, 'released'::text, 'archived'::text])))
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: pronunciations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pronunciations (
    id bigint NOT NULL,
    pattern text NOT NULL,
    replacement text NOT NULL,
    whole_word boolean DEFAULT true NOT NULL,
    match_case boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phoneme boolean DEFAULT false NOT NULL
);


--
-- Name: pronunciations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pronunciations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pronunciations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pronunciations_id_seq OWNED BY public.pronunciations.id;


--
-- Name: provider_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_attempts (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id bigint,
    previous_attempt_id bigint,
    operation text NOT NULL,
    provider text NOT NULL,
    provider_region text,
    route jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_request_id text,
    idempotency_key text,
    payload_fingerprint text NOT NULL,
    status text NOT NULL,
    usage jsonb DEFAULT '{}'::jsonb NOT NULL,
    estimated_cost numeric(12,6) DEFAULT 0 NOT NULL,
    cost numeric(12,6),
    cost_basis text DEFAULT 'unknown'::text NOT NULL,
    error jsonb DEFAULT '{}'::jsonb NOT NULL,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    sent_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_attempts_status_check CHECK ((status = ANY (ARRAY['not_sent'::text, 'sent'::text, 'succeeded'::text, 'definitive_failed'::text, 'ambiguous'::text])))
);


--
-- Name: provider_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.provider_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: provider_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.provider_attempts_id_seq OWNED BY public.provider_attempts.id;


--
-- Name: provider_catalogue_voices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_catalogue_voices (
    id text NOT NULL,
    provider text NOT NULL,
    region text NOT NULL,
    model_id text NOT NULL,
    tier text NOT NULL,
    provider_voice_id text NOT NULL,
    engine text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_model_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_model_capabilities (
    provider_model_id text NOT NULL,
    capability_id text NOT NULL,
    mode_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: provider_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_models (
    id text NOT NULL,
    provider text NOT NULL,
    region text NOT NULL,
    model_id text NOT NULL,
    tier text NOT NULL,
    operation text DEFAULT 'speech'::text NOT NULL,
    enrollment_languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    segmentation jsonb DEFAULT '{}'::jsonb NOT NULL,
    pricing jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    adapter_key text,
    enrollment_supported boolean DEFAULT false NOT NULL
);


--
-- Name: saved_visual_reference_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_visual_reference_files (
    reference_id bigint NOT NULL,
    file_id bigint NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT saved_visual_reference_files_position_check CHECK (("position" >= 0))
);


--
-- Name: saved_visual_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_visual_references (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    reference_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id bigint NOT NULL,
    CONSTRAINT saved_visual_references_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))),
    CONSTRAINT saved_visual_references_type_check CHECK ((reference_type = ANY (ARRAY['character'::text, 'object'::text, 'place'::text, 'style'::text, 'other'::text])))
);


--
-- Name: saved_visual_references_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_visual_references_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_visual_references_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_visual_references_id_seq OWNED BY public.saved_visual_references.id;


--
-- Name: scripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scripts (
    id bigint NOT NULL,
    name text DEFAULT 'Untitled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scripts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scripts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scripts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scripts_id_seq OWNED BY public.scripts.id;


--
-- Name: sound_scene_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sound_scene_history (
    project_id bigint NOT NULL,
    revision bigint NOT NULL,
    document jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sound_scene_history_document_check CHECK ((jsonb_typeof(document) = 'object'::text)),
    CONSTRAINT sound_scene_history_revision_check CHECK ((revision > 0))
);


--
-- Name: sound_scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sound_scenes (
    project_id bigint NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    document jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    history_revision bigint DEFAULT 1 NOT NULL,
    CONSTRAINT sound_scenes_document_check CHECK ((jsonb_typeof(document) = 'object'::text)),
    CONSTRAINT sound_scenes_history_revision_check CHECK ((history_revision > 0)),
    CONSTRAINT sound_scenes_revision_check CHECK ((revision > 0))
);


--
-- Name: clips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clips_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clips_id_seq OWNED BY public.clips.id;


--
-- Name: transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcripts (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    source_url text,
    audio_url text,
    language text,
    duration_ms integer DEFAULT 0 NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    srt text DEFAULT ''::text NOT NULL,
    vtt text DEFAULT ''::text NOT NULL,
    sentences jsonb DEFAULT '[]'::jsonb NOT NULL,
    translated_from bigint,
    stale boolean DEFAULT false NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_job_id bigint,
    model text,
    provider_region text,
    price_version text,
    catalog_rate numeric(16,9),
    catalog_cost numeric(12,6) DEFAULT 0 NOT NULL,
    cost_basis text DEFAULT 'unknown'::text NOT NULL,
    part_id bigint,
    clip_id bigint,
    timing_source text,
    workspace_id bigint
);


--
-- Name: COLUMN transcripts.timing_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transcripts.timing_source IS 'Timing provenance, for example provider_word_timestamps or transcription.';


--
-- Name: transcripts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transcripts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transcripts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transcripts_id_seq OWNED BY public.transcripts.id;


--
-- Name: visual_scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_scenes (
    project_id bigint NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    document jsonb DEFAULT '{"canvas": {"width": 1920, "height": 1080}, "tracks": [], "version": 1}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visual_scenes_document_check CHECK ((jsonb_typeof(document) = 'object'::text)),
    CONSTRAINT visual_scenes_revision_check CHECK ((revision > 0))
);


--
-- Name: voice_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_bindings (
    provider_voice_id text NOT NULL,
    model_id text NOT NULL,
    identity_id text NOT NULL,
    provider text DEFAULT 'alibaba'::text NOT NULL,
    engine text NOT NULL,
    tier text NOT NULL,
    source text DEFAULT 'custom'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reference_id text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_region text DEFAULT 'intl'::text NOT NULL,
    provider_model_id text,
    archived_at timestamp with time zone,
    superseded_by uuid,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    reference_window_id text,
    validation_state text DEFAULT 'approved'::text NOT NULL,
    CONSTRAINT voice_bindings_validation_state_check CHECK ((validation_state = ANY (ARRAY['approved'::text, 'candidate'::text, 'rejected'::text, 'superseded'::text])))
);


--
-- Name: voice_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_identities (
    id text NOT NULL,
    name text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image text,
    gender text,
    age integer,
    accent text,
    trait text,
    scene text,
    notes text,
    recording_language text,
    favourite boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    editorial_language text,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    preferred_reference_id text
);


--
-- Name: voice_package_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_package_jobs (
    id text NOT NULL,
    identity_id text NOT NULL,
    reference_id text,
    model_id text NOT NULL,
    engine text NOT NULL,
    tier text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_voice_id text,
    error text,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'alibaba'::text NOT NULL,
    provider_region text DEFAULT 'intl'::text NOT NULL,
    provider_model_id text,
    classification text DEFAULT 'documented'::text NOT NULL,
    binding_id uuid,
    adapter_key text NOT NULL,
    reference_window_id text
);


--
-- Name: voice_previews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_previews (
    id uuid NOT NULL,
    identity_id text NOT NULL,
    binding_id uuid NOT NULL,
    job_id bigint,
    tag text,
    text text NOT NULL,
    instruction text,
    seed integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    approval_state text DEFAULT 'unreviewed'::text NOT NULL,
    filename text,
    duration_ms integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT voice_previews_approval_state_check CHECK ((approval_state = ANY (ARRAY['unreviewed'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT voice_previews_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: voice_reference_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_reference_windows (
    id text NOT NULL,
    reference_id text NOT NULL,
    provider_model_id text,
    start_ms integer NOT NULL,
    duration_ms integer NOT NULL,
    source_language text,
    transcript text,
    enable_preprocess boolean,
    derived_path text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT voice_reference_windows_duration_ms_check CHECK (((duration_ms >= 1000) AND (duration_ms <= 60000))),
    CONSTRAINT voice_reference_windows_start_ms_check CHECK ((start_ms >= 0))
);


--
-- Name: voice_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_references (
    id text NOT NULL,
    identity_id text,
    original_name text,
    original_path text,
    normalized_path text,
    source_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_language text,
    transcript text,
    sha256 text,
    duration_ms integer,
    sample_rate integer,
    channels integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_backend text DEFAULT 'filesystem'::text NOT NULL,
    storage_bucket text,
    storage_key text,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    original_storage_key text,
    normalized_storage_key text,
    original_sha256 text,
    normalized_sha256 text,
    original_size_bytes bigint,
    normalized_size_bytes bigint
);


--
-- Name: voices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voices (
    id text NOT NULL,
    image text,
    favourite boolean DEFAULT false NOT NULL,
    note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    gender text,
    age integer,
    trait text,
    scene text,
    languages text,
    provider_voice_id text,
    engine text,
    target_model text,
    provider_status text
);


--
-- Name: worker_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_leases (
    worker_id text NOT NULL,
    process_id integer NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workspaces_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workspaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workspaces_id_seq OWNED BY public.workspaces.id;


--
-- Name: audit_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_records ALTER COLUMN id SET DEFAULT nextval('public.audit_records_id_seq'::regclass);


--
-- Name: blocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks ALTER COLUMN id SET DEFAULT nextval('public.blocks_id_seq'::regclass);


--
-- Name: budget_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_reservations ALTER COLUMN id SET DEFAULT nextval('public.budget_reservations_id_seq'::regclass);


--
-- Name: clips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips ALTER COLUMN id SET DEFAULT nextval('public.clips_id_seq'::regclass);


--
-- Name: composer_working_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_working_drafts ALTER COLUMN id SET DEFAULT nextval('public.composer_working_drafts_id_seq'::regclass);


--
-- Name: composition_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composition_drafts ALTER COLUMN id SET DEFAULT nextval('public.composition_drafts_id_seq'::regclass);


--
-- Name: exports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exports ALTER COLUMN id SET DEFAULT nextval('public.exports_id_seq'::regclass);


--
-- Name: file_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions ALTER COLUMN id SET DEFAULT nextval('public.file_versions_id_seq'::regclass);


--
-- Name: files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files ALTER COLUMN id SET DEFAULT nextval('public.files_id_seq'::regclass);


--
-- Name: folders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders ALTER COLUMN id SET DEFAULT nextval('public.folders_id_seq'::regclass);


--
-- Name: job_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_events ALTER COLUMN id SET DEFAULT nextval('public.job_events_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: objects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects ALTER COLUMN id SET DEFAULT nextval('public.objects_id_seq'::regclass);


--
-- Name: project_parts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_parts ALTER COLUMN id SET DEFAULT nextval('public.project_parts_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: pronunciations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pronunciations ALTER COLUMN id SET DEFAULT nextval('public.pronunciations_id_seq'::regclass);


--
-- Name: provider_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_attempts ALTER COLUMN id SET DEFAULT nextval('public.provider_attempts_id_seq'::regclass);


--
-- Name: saved_visual_references id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_references ALTER COLUMN id SET DEFAULT nextval('public.saved_visual_references_id_seq'::regclass);


--
-- Name: scripts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scripts ALTER COLUMN id SET DEFAULT nextval('public.scripts_id_seq'::regclass);


--
-- Name: transcripts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts ALTER COLUMN id SET DEFAULT nextval('public.transcripts_id_seq'::regclass);


--
-- Name: workspaces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces ALTER COLUMN id SET DEFAULT nextval('public.workspaces_id_seq'::regclass);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: audit_records audit_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_records
    ADD CONSTRAINT audit_records_pkey PRIMARY KEY (id);


--
-- Name: audit_records audit_records_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_records
    ADD CONSTRAINT audit_records_public_id_key UNIQUE (public_id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: budget_reservations budget_reservations_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_reservations
    ADD CONSTRAINT budget_reservations_job_id_key UNIQUE (job_id);


--
-- Name: budget_reservations budget_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_reservations
    ADD CONSTRAINT budget_reservations_pkey PRIMARY KEY (id);


--
-- Name: budget_reservations budget_reservations_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_reservations
    ADD CONSTRAINT budget_reservations_public_id_key UNIQUE (public_id);


--
-- Name: capabilities capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_pkey PRIMARY KEY (id);


--
-- Name: clips clips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_pkey PRIMARY KEY (id);


--
-- Name: clips clips_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_public_id_key UNIQUE (public_id);


--
-- Name: composer_working_drafts composer_working_drafts_context_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_context_key_key UNIQUE (context_key);


--
-- Name: composer_working_drafts composer_working_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_pkey PRIMARY KEY (id);


--
-- Name: composer_working_drafts composer_working_drafts_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_public_id_key UNIQUE (public_id);


--
-- Name: composition_drafts composition_drafts_part_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composition_drafts
    ADD CONSTRAINT composition_drafts_part_id_key UNIQUE (part_id);


--
-- Name: composition_drafts composition_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composition_drafts
    ADD CONSTRAINT composition_drafts_pkey PRIMARY KEY (id);


--
-- Name: composition_drafts composition_drafts_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composition_drafts
    ADD CONSTRAINT composition_drafts_public_id_key UNIQUE (public_id);


--
-- Name: exports exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exports
    ADD CONSTRAINT exports_pkey PRIMARY KEY (id);


--
-- Name: file_versions file_versions_file_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_version_key UNIQUE (file_id, version);


--
-- Name: file_versions file_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: folders folders_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_public_id_key UNIQUE (public_id);


--
-- Name: job_events job_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_events
    ADD CONSTRAINT job_events_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: object_file_usages object_file_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_file_usages
    ADD CONSTRAINT object_file_usages_pkey PRIMARY KEY (object_id, file_id, purpose);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: objects objects_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_public_id_key UNIQUE (public_id);


--
-- Name: project_file_usages project_file_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_file_usages
    ADD CONSTRAINT project_file_usages_pkey PRIMARY KEY (project_id, file_id, purpose);


--
-- Name: project_parts project_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_parts
    ADD CONSTRAINT project_parts_pkey PRIMARY KEY (id);


--
-- Name: project_parts project_parts_project_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_parts
    ADD CONSTRAINT project_parts_project_id_position_key UNIQUE (project_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_public_id_key UNIQUE (public_id);


--
-- Name: pronunciations pronunciations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pronunciations
    ADD CONSTRAINT pronunciations_pkey PRIMARY KEY (id);


--
-- Name: provider_attempts provider_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_attempts
    ADD CONSTRAINT provider_attempts_pkey PRIMARY KEY (id);


--
-- Name: provider_attempts provider_attempts_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_attempts
    ADD CONSTRAINT provider_attempts_public_id_key UNIQUE (public_id);


--
-- Name: provider_catalogue_voices provider_catalogue_voices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_catalogue_voices
    ADD CONSTRAINT provider_catalogue_voices_pkey PRIMARY KEY (id);


--
-- Name: provider_catalogue_voices provider_catalogue_voices_provider_region_model_id_tier_pro_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_catalogue_voices
    ADD CONSTRAINT provider_catalogue_voices_provider_region_model_id_tier_pro_key UNIQUE (provider, region, model_id, tier, provider_voice_id);


--
-- Name: provider_model_capabilities provider_model_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_model_capabilities
    ADD CONSTRAINT provider_model_capabilities_pkey PRIMARY KEY (provider_model_id, capability_id);


--
-- Name: provider_models provider_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_models
    ADD CONSTRAINT provider_models_pkey PRIMARY KEY (id);


--
-- Name: provider_models provider_models_provider_region_model_id_tier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_models
    ADD CONSTRAINT provider_models_provider_region_model_id_tier_key UNIQUE (provider, region, model_id, tier);


--
-- Name: saved_visual_reference_files saved_visual_reference_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_reference_files
    ADD CONSTRAINT saved_visual_reference_files_pkey PRIMARY KEY (reference_id, file_id);


--
-- Name: saved_visual_reference_files saved_visual_reference_files_reference_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_reference_files
    ADD CONSTRAINT saved_visual_reference_files_reference_id_position_key UNIQUE (reference_id, "position");


--
-- Name: saved_visual_references saved_visual_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_references
    ADD CONSTRAINT saved_visual_references_pkey PRIMARY KEY (id);


--
-- Name: saved_visual_references saved_visual_references_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_references
    ADD CONSTRAINT saved_visual_references_public_id_key UNIQUE (public_id);


--
-- Name: scripts scripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scripts
    ADD CONSTRAINT scripts_pkey PRIMARY KEY (id);


--
-- Name: sound_scene_history sound_scene_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sound_scene_history
    ADD CONSTRAINT sound_scene_history_pkey PRIMARY KEY (project_id, revision);


--
-- Name: sound_scenes sound_scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sound_scenes
    ADD CONSTRAINT sound_scenes_pkey PRIMARY KEY (project_id);


--
-- Name: transcripts transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_pkey PRIMARY KEY (id);


--
-- Name: visual_scenes visual_scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visual_scenes
    ADD CONSTRAINT visual_scenes_pkey PRIMARY KEY (project_id);


--
-- Name: voice_bindings voice_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_bindings
    ADD CONSTRAINT voice_bindings_pkey PRIMARY KEY (provider_voice_id, model_id);


--
-- Name: voice_identities voice_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_identities
    ADD CONSTRAINT voice_identities_pkey PRIMARY KEY (id);


--
-- Name: voice_package_jobs voice_package_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_package_jobs
    ADD CONSTRAINT voice_package_jobs_pkey PRIMARY KEY (id);


--
-- Name: voice_previews voice_previews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_previews
    ADD CONSTRAINT voice_previews_pkey PRIMARY KEY (id);


--
-- Name: voice_reference_windows voice_reference_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_reference_windows
    ADD CONSTRAINT voice_reference_windows_pkey PRIMARY KEY (id);


--
-- Name: voice_references voice_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_references
    ADD CONSTRAINT voice_references_pkey PRIMARY KEY (id);


--
-- Name: voices voices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voices
    ADD CONSTRAINT voices_pkey PRIMARY KEY (id);


--
-- Name: worker_leases worker_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_leases
    ADD CONSTRAINT worker_leases_pkey PRIMARY KEY (worker_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_public_id_key UNIQUE (public_id);


--
-- Name: audit_records_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_records_resource_idx ON public.audit_records USING btree (resource_type, resource_id, created_at DESC);


--
-- Name: blocks_script_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocks_script_idx ON public.blocks USING btree (script_id, "position");


--
-- Name: clips_binding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clips_binding_idx ON public.clips USING btree (binding_id);


--
-- Name: clips_one_recording_per_part_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clips_one_recording_per_part_idx ON public.clips USING btree (part_id);


--
-- Name: clips_part_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clips_part_idx ON public.clips USING btree (part_id, created_at DESC);


--
-- Name: composer_working_drafts_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX composer_working_drafts_project_idx ON public.composer_working_drafts USING btree (project_id, updated_at DESC);


--
-- Name: exports_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exports_project_idx ON public.exports USING btree (project_id, created_at DESC);


--
-- Name: exports_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exports_public_id_idx ON public.exports USING btree (public_id);


--
-- Name: file_versions_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_versions_file_idx ON public.file_versions USING btree (file_id, version DESC);


--
-- Name: file_versions_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX file_versions_public_id_idx ON public.file_versions USING btree (public_id);


--
-- Name: files_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_category_idx ON public.files USING btree (category) WHERE (category IS NOT NULL);


--
-- Name: files_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_folder_idx ON public.files USING btree (folder_id, updated_at DESC);


--
-- Name: files_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX files_public_id_idx ON public.files USING btree (public_id);


--
-- Name: files_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_tags_idx ON public.files USING gin (tags);


--
-- Name: files_workspace_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_workspace_updated_idx ON public.files USING btree (workspace_id, updated_at DESC);


--
-- Name: folders_space_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_workspace_parent_idx ON public.folders USING btree (workspace_id, parent_id, name);


--
-- Name: job_events_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_events_job_idx ON public.job_events USING btree (job_id, id);


--
-- Name: jobs_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_actor_idx ON public.jobs USING btree (actor_id, created_at DESC);


--
-- Name: jobs_creation_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_creation_action_idx ON public.jobs USING btree (creation_action_id, created_at DESC) WHERE (creation_action_id IS NOT NULL);


--
-- Name: jobs_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_kind_idx ON public.jobs USING btree (kind);


--
-- Name: jobs_organization_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jobs_organization_idempotency_idx ON public.jobs USING btree (organization_id, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (organization_id IS NOT NULL));


--
-- Name: jobs_organization_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_organization_idx ON public.jobs USING btree (organization_id, created_at DESC);


--
-- Name: jobs_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_parent_idx ON public.jobs USING btree (parent_id);


--
-- Name: jobs_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jobs_public_id_idx ON public.jobs USING btree (public_id);


--
-- Name: jobs_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_queue_idx ON public.jobs USING btree (status, available_at, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'retrying'::text]));


--
-- Name: jobs_running_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_running_idx ON public.jobs USING btree (status) WHERE (status = 'running'::text);


--
-- Name: jobs_space_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_workspace_created_idx ON public.jobs USING btree (workspace_id, created_at DESC);


--
-- Name: jobs_speak_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_speak_session_idx ON public.jobs USING btree (((payload ->> 'session_id'::text)), created_at DESC) WHERE ((kind = 'speech'::text) AND (source_tool = 'speak'::text) AND (project_id IS NULL));


--
-- Name: jobs_when_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_when_idx ON public.jobs USING btree (created_at DESC);


--
-- Name: object_file_usages_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX object_file_usages_file_idx ON public.object_file_usages USING btree (file_id, created_at DESC);


--
-- Name: objects_workspace_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX objects_workspace_updated_idx ON public.objects USING btree (workspace_id, updated_at DESC);


--
-- Name: project_file_usages_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_file_usages_file_idx ON public.project_file_usages USING btree (file_id, created_at DESC);


--
-- Name: project_parts_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_parts_project_idx ON public.project_parts USING btree (project_id, "position");


--
-- Name: project_parts_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX project_parts_public_id_idx ON public.project_parts USING btree (public_id);


--
-- Name: provider_attempts_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_attempts_job_idx ON public.provider_attempts USING btree (job_id, created_at);


--
-- Name: saved_visual_reference_files_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_visual_reference_files_file_idx ON public.saved_visual_reference_files USING btree (file_id);


--
-- Name: saved_visual_references_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_visual_references_workspace_idx ON public.saved_visual_references USING btree (workspace_id, updated_at DESC, id DESC);


--
-- Name: transcripts_clip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcripts_clip_idx ON public.transcripts USING btree (clip_id, created_at DESC);


--
-- Name: transcripts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcripts_created_idx ON public.transcripts USING btree (created_at DESC);


--
-- Name: transcripts_part_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcripts_part_idx ON public.transcripts USING btree (part_id, created_at DESC);


--
-- Name: transcripts_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transcripts_public_id_idx ON public.transcripts USING btree (public_id);


--
-- Name: transcripts_source_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcripts_source_job_idx ON public.transcripts USING btree (source_job_id);


--
-- Name: transcripts_space_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcripts_workspace_created_idx ON public.transcripts USING btree (workspace_id, created_at DESC) WHERE (workspace_id IS NOT NULL);


--
-- Name: voice_bindings_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX voice_bindings_id_idx ON public.voice_bindings USING btree (id);


--
-- Name: voice_bindings_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_bindings_identity_idx ON public.voice_bindings USING btree (identity_id);


--
-- Name: voice_bindings_one_approved_method; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX voice_bindings_one_approved_method ON public.voice_bindings USING btree (identity_id, provider, provider_region, model_id) WHERE ((validation_state = 'approved'::text) AND (archived_at IS NULL));


--
-- Name: voice_bindings_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_bindings_reference_idx ON public.voice_bindings USING btree (reference_id);


--
-- Name: voice_identities_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX voice_identities_public_id_idx ON public.voice_identities USING btree (public_id);


--
-- Name: voice_package_jobs_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_package_jobs_identity_idx ON public.voice_package_jobs USING btree (identity_id, created_at);


--
-- Name: voice_package_jobs_route_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_package_jobs_route_idx ON public.voice_package_jobs USING btree (identity_id, reference_id, provider, provider_region, model_id);


--
-- Name: voice_previews_identity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_previews_identity_created ON public.voice_previews USING btree (identity_id, created_at DESC);


--
-- Name: voice_reference_windows_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX voice_reference_windows_scope_unique ON public.voice_reference_windows USING btree (reference_id, COALESCE(provider_model_id, ''::text));


--
-- Name: voice_references_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_references_identity_idx ON public.voice_references USING btree (identity_id);


--
-- Name: voice_references_public_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX voice_references_public_id_idx ON public.voice_references USING btree (public_id);


--
-- Name: worker_leases_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worker_leases_last_seen_idx ON public.worker_leases USING btree (last_seen_at DESC);


--
-- Name: blocks blocks_script_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_script_id_fkey FOREIGN KEY (script_id) REFERENCES public.scripts(id) ON DELETE CASCADE;


--
-- Name: budget_reservations budget_reservations_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_reservations
    ADD CONSTRAINT budget_reservations_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: clips clips_binding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES public.voice_bindings(id) ON DELETE SET NULL;


--
-- Name: clips clips_capability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.capabilities(id) ON DELETE SET NULL;


--
-- Name: clips clips_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_part_id_fkey FOREIGN KEY (part_id) REFERENCES public.project_parts(id) ON DELETE CASCADE;


--
-- Name: clips clips_provider_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_provider_attempt_id_fkey FOREIGN KEY (provider_attempt_id) REFERENCES public.provider_attempts(id) ON DELETE SET NULL;


--
-- Name: clips clips_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.voice_references(id) ON DELETE SET NULL;


--
-- Name: clips clips_voice_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clips
    ADD CONSTRAINT clips_voice_identity_id_fkey FOREIGN KEY (voice_identity_id) REFERENCES public.voice_identities(id) ON DELETE SET NULL;


--
-- Name: composer_working_drafts composer_working_drafts_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_part_id_fkey FOREIGN KEY (part_id) REFERENCES public.project_parts(id) ON DELETE CASCADE;


--
-- Name: composer_working_drafts composer_working_drafts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_working_drafts
    ADD CONSTRAINT composer_working_drafts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: composition_drafts composition_drafts_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composition_drafts
    ADD CONSTRAINT composition_drafts_part_id_fkey FOREIGN KEY (part_id) REFERENCES public.project_parts(id) ON DELETE CASCADE;


--
-- Name: composition_drafts composition_drafts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composition_drafts
    ADD CONSTRAINT composition_drafts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: exports exports_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exports
    ADD CONSTRAINT exports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: file_versions file_versions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: files files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: files files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folders folders_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: job_events job_events_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_events
    ADD CONSTRAINT job_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_clip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_clip_id_fkey FOREIGN KEY (clip_id) REFERENCES public.clips(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_part_id_fkey FOREIGN KEY (part_id) REFERENCES public.project_parts(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_provider_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_provider_attempt_id_fkey FOREIGN KEY (provider_attempt_id) REFERENCES public.provider_attempts(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_voice_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_voice_identity_id_fkey FOREIGN KEY (voice_identity_id) REFERENCES public.voice_identities(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: object_file_usages object_file_usages_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_file_usages
    ADD CONSTRAINT object_file_usages_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: object_file_usages object_file_usages_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_file_usages
    ADD CONSTRAINT object_file_usages_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;


--
-- Name: objects objects_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: objects objects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: project_file_usages project_file_usages_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_file_usages
    ADD CONSTRAINT project_file_usages_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: project_file_usages project_file_usages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_file_usages
    ADD CONSTRAINT project_file_usages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_parts project_parts_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_parts
    ADD CONSTRAINT project_parts_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE SET NULL;


--
-- Name: project_parts project_parts_file_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_parts
    ADD CONSTRAINT project_parts_file_version_id_fkey FOREIGN KEY (file_version_id) REFERENCES public.file_versions(id) ON DELETE SET NULL;


--
-- Name: project_parts project_parts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_parts
    ADD CONSTRAINT project_parts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: projects projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: provider_attempts provider_attempts_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_attempts
    ADD CONSTRAINT provider_attempts_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: provider_attempts provider_attempts_previous_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_attempts
    ADD CONSTRAINT provider_attempts_previous_attempt_id_fkey FOREIGN KEY (previous_attempt_id) REFERENCES public.provider_attempts(id) ON DELETE SET NULL;


--
-- Name: provider_model_capabilities provider_model_capabilities_capability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_model_capabilities
    ADD CONSTRAINT provider_model_capabilities_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.capabilities(id) ON DELETE RESTRICT;


--
-- Name: provider_model_capabilities provider_model_capabilities_provider_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_model_capabilities
    ADD CONSTRAINT provider_model_capabilities_provider_model_id_fkey FOREIGN KEY (provider_model_id) REFERENCES public.provider_models(id) ON DELETE CASCADE;


--
-- Name: saved_visual_reference_files saved_visual_reference_files_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_reference_files
    ADD CONSTRAINT saved_visual_reference_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: saved_visual_reference_files saved_visual_reference_files_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_reference_files
    ADD CONSTRAINT saved_visual_reference_files_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.saved_visual_references(id) ON DELETE CASCADE;


--
-- Name: saved_visual_references saved_visual_references_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_visual_references
    ADD CONSTRAINT saved_visual_references_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sound_scene_history sound_scene_history_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sound_scene_history
    ADD CONSTRAINT sound_scene_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.sound_scenes(project_id) ON DELETE CASCADE;


--
-- Name: sound_scenes sound_scenes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sound_scenes
    ADD CONSTRAINT sound_scenes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: transcripts transcripts_clip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_clip_id_fkey FOREIGN KEY (clip_id) REFERENCES public.clips(id) ON DELETE SET NULL;


--
-- Name: transcripts transcripts_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_part_id_fkey FOREIGN KEY (part_id) REFERENCES public.project_parts(id) ON DELETE SET NULL;


--
-- Name: transcripts transcripts_source_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_source_job_id_fkey FOREIGN KEY (source_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: transcripts transcripts_translated_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_translated_from_fkey FOREIGN KEY (translated_from) REFERENCES public.transcripts(id) ON DELETE CASCADE;


--
-- Name: transcripts transcripts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: visual_scenes visual_scenes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visual_scenes
    ADD CONSTRAINT visual_scenes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: voice_bindings voice_bindings_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_bindings
    ADD CONSTRAINT voice_bindings_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.voice_identities(id) ON DELETE CASCADE;


--
-- Name: voice_bindings voice_bindings_provider_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_bindings
    ADD CONSTRAINT voice_bindings_provider_model_id_fkey FOREIGN KEY (provider_model_id) REFERENCES public.provider_models(id) ON DELETE SET NULL;


--
-- Name: voice_bindings voice_bindings_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_bindings
    ADD CONSTRAINT voice_bindings_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.voice_references(id) ON DELETE SET NULL;


--
-- Name: voice_bindings voice_bindings_reference_window_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_bindings
    ADD CONSTRAINT voice_bindings_reference_window_id_fkey FOREIGN KEY (reference_window_id) REFERENCES public.voice_reference_windows(id) ON DELETE SET NULL;


--
-- Name: voice_bindings voice_bindings_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_bindings
    ADD CONSTRAINT voice_bindings_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.voice_bindings(id) ON DELETE SET NULL;


--
-- Name: voice_identities voice_identities_preferred_reference_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_identities
    ADD CONSTRAINT voice_identities_preferred_reference_fkey FOREIGN KEY (preferred_reference_id) REFERENCES public.voice_references(id) ON DELETE SET NULL;


--
-- Name: voice_package_jobs voice_package_jobs_binding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_package_jobs
    ADD CONSTRAINT voice_package_jobs_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES public.voice_bindings(id) ON DELETE SET NULL;


--
-- Name: voice_package_jobs voice_package_jobs_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_package_jobs
    ADD CONSTRAINT voice_package_jobs_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.voice_identities(id) ON DELETE CASCADE;


--
-- Name: voice_package_jobs voice_package_jobs_provider_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_package_jobs
    ADD CONSTRAINT voice_package_jobs_provider_model_id_fkey FOREIGN KEY (provider_model_id) REFERENCES public.provider_models(id) ON DELETE SET NULL;


--
-- Name: voice_package_jobs voice_package_jobs_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_package_jobs
    ADD CONSTRAINT voice_package_jobs_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.voice_references(id) ON DELETE SET NULL;


--
-- Name: voice_package_jobs voice_package_jobs_reference_window_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_package_jobs
    ADD CONSTRAINT voice_package_jobs_reference_window_id_fkey FOREIGN KEY (reference_window_id) REFERENCES public.voice_reference_windows(id) ON DELETE RESTRICT;


--
-- Name: voice_previews voice_previews_binding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_previews
    ADD CONSTRAINT voice_previews_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES public.voice_bindings(id) ON DELETE CASCADE;


--
-- Name: voice_previews voice_previews_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_previews
    ADD CONSTRAINT voice_previews_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.voice_identities(id) ON DELETE CASCADE;


--
-- Name: voice_previews voice_previews_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_previews
    ADD CONSTRAINT voice_previews_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: voice_reference_windows voice_reference_windows_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_reference_windows
    ADD CONSTRAINT voice_reference_windows_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.voice_references(id) ON DELETE CASCADE;


--
-- Name: voice_references voice_references_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_references
    ADD CONSTRAINT voice_references_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.voice_identities(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: capabilities; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.capabilities (id, name, description, controls, ui_metadata, archived_at, created_at, updated_at) VALUES ('expressive_tags', 'Expressive + tags', 'Expressive speech with documented delivery tags.', '{"rate": true, "pitch": true, "volume": true, "delivery_tags": true, "direction_modes": ["directed"], "natural_direction": true}', '{"direction_label": "Voice direction"}', NULL, '2026-09-02 00:04:18.663715+00', '2026-09-02 00:04:18.663715+00');
INSERT INTO public.capabilities (id, name, description, controls, ui_metadata, archived_at, created_at, updated_at) VALUES ('exact_longform', 'Exact long reading', 'Faithful long-form speech from a cloned voice.', '{"rate": false, "pitch": false, "volume": false, "delivery_tags": false, "direction_modes": ["exact"], "natural_direction": false}', '{"output_note": "The cloned voice and prepared script control the delivery. Precise numeric speed, pitch, and volume controls are unavailable."}', NULL, '2026-09-02 00:04:18.663715+00', '2026-09-02 00:04:18.663715+00');
INSERT INTO public.capabilities (id, name, description, controls, ui_metadata, archived_at, created_at, updated_at) VALUES ('controlled_exact', 'Controlled exact reading', 'Faithful cloned-voice speech with precise native delivery controls.', '{"rate": true, "seed": true, "ssml": true, "pitch": true, "volume": true, "delivery_tags": false, "language_hints": true, "direction_modes": ["exact"], "word_timestamps": true, "natural_direction": false}', '{"output_note": "Supports precise speed, pitch, volume, repeatable seed, SSML and captured word timing."}', NULL, '2026-09-02 00:04:18.663715+00', '2026-09-02 00:04:18.663715+00');


--
-- Data for Name: provider_models; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.provider_models (id, provider, region, model_id, tier, operation, enrollment_languages, output_languages, limits, segmentation, pricing, status, metadata, created_at, updated_at, adapter_key, enrollment_supported) VALUES ('alibaba:intl:qwen-audio-3.0-tts-flash', 'alibaba', 'intl', 'qwen-audio-3.0-tts-flash', 'flash', 'voice_clone', '["zh", "en", "ja", "ko", "de", "fr", "it", "ru", "pt", "th", "id", "ms", "vi"]', '["Chinese", "English", "Japanese", "Korean", "German", "French", "Italian", "Russian", "Portuguese", "Thai", "Indonesian", "Malay", "Vietnamese"]', '{}', '{}', '{"enrollment_cost_usd": 0.0, "speech_per_million_chars": 15.0}', 'active', '{"model_label": "Qwen Audio TTS · Flash"}', '2026-09-02 00:04:18.663715+00', '2026-09-02 00:04:18.663715+00', 'audio', true);
INSERT INTO public.provider_models (id, provider, region, model_id, tier, operation, enrollment_languages, output_languages, limits, segmentation, pricing, status, metadata, created_at, updated_at, adapter_key, enrollment_supported) VALUES ('alibaba:intl:qwen3-tts-vc-2026-01-22', 'alibaba', 'intl', 'qwen3-tts-vc-2026-01-22', 'vc', 'voice_clone', '["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"]', '["Chinese", "English", "German", "Italian", "Portuguese", "Spanish", "Japanese", "Korean", "French", "Russian"]', '{}', '{}', '{"enrollment_cost_usd": 0.01, "speech_per_million_chars": 11.5}', 'active', '{"model_label": "Qwen3 TTS Voice Clone"}', '2026-09-02 00:04:18.663715+00', '2026-09-02 00:04:18.663715+00', 'qwen_tts', true);
INSERT INTO public.provider_models (id, provider, region, model_id, tier, operation, enrollment_languages, output_languages, limits, segmentation, pricing, status, metadata, created_at, updated_at, adapter_key, enrollment_supported) VALUES ('alibaba:intl:cosyvoice-v3-plus', 'alibaba', 'intl', 'cosyvoice-v3-plus', 'plus', 'voice_clone', '["zh", "en", "fr", "de", "ja", "ko", "ru"]', '["Chinese", "English", "French", "German", "Japanese", "Korean", "Russian"]', '{"seed_max": 65535, "seed_min": 0, "characters_per_session": 200000, "characters_per_submission": 20000}', '{"mode": "continuous_session", "characters_per_session": 200000, "characters_per_submission": 20000, "ssml_submissions_per_session": 1}', '{"enrollment_cost_usd": 0, "speech_per_million_chars": 26.0}', 'active', '{"ssml": true, "inline_tags": false, "model_label": "CosyVoice V3 Plus", "instruction_control": false, "streaming_word_timestamps": true}', '2026-09-02 00:04:18.663715+00', '2026-09-02 00:04:18.663715+00', 'cosyvoice', true);


--
-- Data for Name: provider_model_capabilities; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.provider_model_capabilities (provider_model_id, capability_id, mode_metadata) VALUES ('alibaba:intl:qwen-audio-3.0-tts-flash', 'expressive_tags', '{}');
INSERT INTO public.provider_model_capabilities (provider_model_id, capability_id, mode_metadata) VALUES ('alibaba:intl:qwen3-tts-vc-2026-01-22', 'exact_longform', '{}');
INSERT INTO public.provider_model_capabilities (provider_model_id, capability_id, mode_metadata) VALUES ('alibaba:intl:cosyvoice-v3-plus', 'controlled_exact', '{}');


--
-- PostgreSQL database dump complete
--
