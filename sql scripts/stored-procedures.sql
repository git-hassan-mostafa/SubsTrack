-- ============================================================
-- EXTENSION
-- pgcrypto gives us the crypt() and gen_salt() functions used
-- below to hash the user's password with bcrypt before storing
-- it. This only needs to be run once per database.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- FUNCTION: create_tenant_user
--
-- Purpose  : Creates a fully working app user in one shot:
--            an auth login record, a login identity record,
--            and the public profile row.
--
-- Called by: The frontend via supabase.rpc('create_tenant_user')
--            after the admin fills in the "Add User" form.
--
-- Security : SECURITY DEFINER means the function runs with the
--            privileges of the user who CREATED it (the DB owner),
--            not the caller. This is necessary because normal app
--            users don't have permission to write to auth.users or
--            auth.identities — only the DB owner does.
--            SET search_path = public locks down which schema is
--            searched by default, preventing schema-injection attacks.
--
-- Transaction: Everything runs inside one transaction. If any
--            single step fails, ALL changes are rolled back
--            automatically — no partial state is ever left behind.
-- ============================================================
CREATE OR REPLACE FUNCTION create_tenant_user(
  p_username  TEXT,   -- the new user's chosen username
  p_password  TEXT,   -- plain-text password (hashed before storage)
  p_phone     TEXT,   -- optional phone number (can be NULL)
  p_role      TEXT,   -- 'admin' or 'user'
  p_tenant_id UUID    -- which tenant this user belongs to
)
RETURNS JSON          -- returns the newly created public.users row as JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Variables to hold the calling user's profile data
  v_caller_role      TEXT;
  v_caller_tenant_id UUID;

  -- Variables built up during the function
  v_tenant_code      TEXT;   -- e.g. "acme" — used to build the email
  v_username         TEXT;   -- normalised (lowercased, trimmed) username
  v_email            TEXT;   -- synthetic email: username@tenantcode.com
  v_user_id          UUID;   -- generated ID shared across all three inserts
  v_profile          JSON;   -- the final public.users row returned to the caller
BEGIN

  -- ----------------------------------------------------------
  -- STEP 1 — INPUT VALIDATION
  -- All inputs are validated before any database work begins.
  -- NULL checks must be written explicitly: in SQL, expressions
  -- like (NULL <> 'some-value') or (NULL NOT IN (...)) evaluate
  -- to NULL — which is treated as FALSE — so without these
  -- explicit guards, NULL inputs would silently pass through.
  -- ----------------------------------------------------------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF p_username IS NULL OR TRIM(p_username) = '' THEN
    RAISE EXCEPTION 'Username is required';
  END IF;

  -- Minimum 8 characters is enforced here as a database-level
  -- safety net (the frontend validates this too).
  IF p_password IS NULL OR LENGTH(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  -- Normalise the username: strip surrounding whitespace and
  -- force lowercase so "Alice" and "alice" are treated the same.
  v_username := LOWER(TRIM(p_username));


  -- ----------------------------------------------------------
  -- STEP 2 — CALLER IDENTITY & AUTHORISATION
  -- auth.uid() returns the UUID of the currently authenticated
  -- user from their JWT. We look up their profile to confirm:
  --   a) They exist (not an anonymous / unauthenticated call)
  --   b) They have the 'admin' role
  --   c) They are trying to create a user in their OWN tenant
  --      (tenant isolation — an admin cannot create users for
  --       a different company)
  -- ----------------------------------------------------------
  SELECT role, tenant_id
    INTO v_caller_role, v_caller_tenant_id
    FROM public.users
   WHERE id = auth.uid();

  -- If no row was found, auth.uid() was NULL or the user has
  -- no profile — either way they are not allowed to proceed.
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  -- Reject attempts to create users for a different tenant.
  IF p_tenant_id <> v_caller_tenant_id THEN
    RAISE EXCEPTION 'Forbidden: cannot create users for another tenant';
  END IF;


  -- ----------------------------------------------------------
  -- STEP 3 — RESOLVE TENANT CODE
  -- The tenant_code is a short slug (e.g. "acme") that is part
  -- of every user's synthetic email address. We fetch it here
  -- to build the email in the next step.
  -- ----------------------------------------------------------
  SELECT tenant_code
    INTO v_tenant_code
    FROM public.tenants
   WHERE id = p_tenant_id;

  IF v_tenant_code IS NULL THEN
    RAISE EXCEPTION 'Tenant not found or missing tenant_code';
  END IF;


  -- ----------------------------------------------------------
  -- STEP 4 — BUILD EMAIL AND GENERATE USER ID
  -- Users in this app don't have real email addresses. We
  -- construct a synthetic one in the format:
  --   username@tenantcode.com
  -- This must match exactly what the login screen sends when
  -- the user types their username and workspace code.
  -- The same UUID is used across all three tables so every
  -- record refers to the same person.
  -- ----------------------------------------------------------
  v_email   := v_username || '@' || v_tenant_code || '.com';
  v_user_id := gen_random_uuid();


  -- ----------------------------------------------------------
  -- STEP 5 — CREATE THE AUTH LOGIN RECORD (auth.users)
  -- This is the record Supabase's auth system uses to verify
  -- the password at login time.
  --
  -- Key fields:
  --   encrypted_password : the password run through bcrypt via
  --                         pgcrypto — never stored as plain text.
  --   email_confirmed_at : set to NOW() so the account is active
  --                         immediately (no confirmation email needed).
  --   raw_app_meta_data  : tells Supabase this is an email/password
  --                         account (not Google, GitHub, etc.).
  --   role / aud         : standard Supabase values for a regular
  --                         authenticated user.
  --
  -- If the email already exists (duplicate username in this tenant),
  -- PostgreSQL raises a unique_violation which we catch and convert
  -- into a readable error message.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000', -- single-tenant Supabase instance ID
      v_email,
      crypt(p_password, gen_salt('bf')),       -- bcrypt hash of the plain-text password
      NOW(),                                   -- confirm the account immediately
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      'authenticated',
      'authenticated'
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A user with this username already exists';
  END;


  -- ----------------------------------------------------------
  -- STEP 6 — CREATE THE IDENTITY RECORD (auth.identities)
  -- Supabase requires an entry in auth.identities for the user
  -- to be able to sign in with email/password. Without this row,
  -- the auth.users record exists but login will not work.
  --
  -- Key fields:
  --   provider_id    : the email address, used to look up the
  --                    identity during sign-in.
  --   identity_data  : a JSON object containing 'sub' (the user's
  --                    UUID) and 'email'. Supabase reads these
  --                    fields internally.
  --   provider       : 'email' means plain email/password login
  --                    (as opposed to 'google', 'github', etc.).
  --
  -- Note: newer Supabase versions have an auto-generated `email`
  -- column on this table that is computed from identity_data, so
  -- it is intentionally left out of this INSERT.
  -- ----------------------------------------------------------
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_email,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );


  -- ----------------------------------------------------------
  -- STEP 7 — CREATE THE PUBLIC PROFILE (public.users)
  -- This is the app-level user record that the rest of the app
  -- reads (username, role, tenant, phone number). It shares the
  -- same UUID as the auth records above so they all refer to the
  -- same person.
  --
  -- RETURNING ... INTO v_profile captures the inserted row as
  -- JSON so it can be returned to the caller.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO public.users (id, username, phone_number, role, tenant_id)
    VALUES (v_user_id, v_username, p_phone, p_role, p_tenant_id)
    RETURNING row_to_json(public.users.*) INTO v_profile;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A user with this username already exists';
  END;


  -- ----------------------------------------------------------
  -- STEP 8 — RETURN RESULT
  -- All three records were created successfully. Return the
  -- public profile row to the caller (the frontend maps this
  -- JSON into an AppUser object).
  --
  -- If ANY of the steps above raised an unhandled exception,
  -- PostgreSQL automatically rolls back the entire transaction,
  -- leaving all three tables in their original state.
  -- ----------------------------------------------------------
  RETURN v_profile;
END;
$$;


-- ============================================================
-- PERMISSIONS
-- By default PostgreSQL grants EXECUTE to PUBLIC (everyone).
-- We tighten this so only authenticated (logged-in) users can
-- call the function. Anonymous / unauthenticated callers are
-- explicitly blocked.
-- ============================================================
REVOKE EXECUTE ON FUNCTION create_tenant_user(TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION create_tenant_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
