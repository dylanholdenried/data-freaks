-- Owner-admin sessions must complete TOTP (JWT aal=aal2) before
-- is_platform_admin() / is_owner_admin() succeed. That closes the
-- PostgREST path where a stolen owner password (AAL1) could read all
-- dealer rows via the platform-admin SELECT fast-path.
--
-- platform_admin (non-owner) is unchanged. Dealer roles are unchanged.
-- Auth enroll/challenge/verify still work at AAL1.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.user_id = (SELECT auth.uid()) OR p.id = (SELECT auth.uid()))
      AND p.status = 'active'
      AND (
        p.role = 'platform_admin'
        OR (
          p.role = 'owner_admin'
          AND COALESCE((SELECT auth.jwt()->>'aal'), 'aal1') = 'aal2'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.user_id = (SELECT auth.uid()) OR p.id = (SELECT auth.uid()))
      AND p.role = 'owner_admin'
      AND p.status = 'active'
      AND COALESCE((SELECT auth.jwt()->>'aal'), 'aal1') = 'aal2'
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'True for active platform_admin, or active owner_admin with AAL2 (MFA).';

COMMENT ON FUNCTION public.is_owner_admin() IS
  'True for active owner_admin whose session has completed TOTP (aal2).';
