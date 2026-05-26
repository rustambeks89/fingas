-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Enable required Postgres extensions (uuid generation, citext).

create extension if not exists "pgcrypto";
create extension if not exists "citext";
