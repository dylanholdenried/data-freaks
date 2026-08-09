import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { canMutateAppData, isAutoGroupUserRole, isStoreViewer } from "@/lib/roles";

export const IMPERSONATION_COOKIE = "df_impersonation";

/** Impersonation sessions expire after 60 minutes. */
export const IMPERSONATION_MAX_AGE_SEC = 60 * 60;

export type ImpersonationPayload = {
  actorEmail: string;
  actorProfileId: string;
  actorUserId: string;
  targetProfileId: string;
  targetEmail: string;
  exp: number;
};

function getSecret(): string {
  const secret =
    process.env.IMPERSONATION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  if (!secret) {
    throw new Error("Missing IMPERSONATION_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  }
  return secret;
}

function signBody(body: string): string {
  return createHmac("sha256", getSecret()).update(body).digest("base64url");
}

export function encodeImpersonationCookie(payload: ImpersonationPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

export function decodeImpersonationCookie(raw: string | undefined | null): ImpersonationPayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = signBody(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ImpersonationPayload;
    if (
      !parsed ||
      typeof parsed.actorEmail !== "string" ||
      typeof parsed.actorProfileId !== "string" ||
      typeof parsed.actorUserId !== "string" ||
      typeof parsed.targetProfileId !== "string" ||
      typeof parsed.targetEmail !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildImpersonationPayload(input: {
  actorEmail: string;
  actorProfileId: string;
  actorUserId: string;
  targetProfileId: string;
  targetEmail: string;
  maxAgeSec?: number;
}): ImpersonationPayload {
  const maxAge = input.maxAgeSec ?? IMPERSONATION_MAX_AGE_SEC;
  return {
    actorEmail: input.actorEmail.trim().toLowerCase(),
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorUserId,
    targetProfileId: input.targetProfileId,
    targetEmail: input.targetEmail.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + maxAge,
  };
}

export function impersonationCookieOptions(maxAgeSec = IMPERSONATION_MAX_AGE_SEC) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export async function getImpersonationState(): Promise<ImpersonationPayload | null> {
  const cookieStore = cookies();
  return decodeImpersonationCookie(cookieStore.get(IMPERSONATION_COOKIE)?.value);
}

export async function isImpersonating(): Promise<boolean> {
  return (await getImpersonationState()) !== null;
}

export async function clearImpersonationCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set({
    name: IMPERSONATION_COOKIE,
    value: "",
    ...impersonationCookieOptions(0),
    maxAge: 0,
  });
}

export async function setImpersonationCookie(payload: ImpersonationPayload): Promise<void> {
  const cookieStore = cookies();
  const maxAge = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
  cookieStore.set({
    name: IMPERSONATION_COOKIE,
    value: encodeImpersonationCookie(payload),
    ...impersonationCookieOptions(maxAge),
  });
}

/** Eligible targets: active auto-group users only (not platform staff, not self). */
export function canImpersonateTarget(input: {
  actorProfileId: string;
  target: { id: string; role: string | null; status: string | null; email?: string | null };
}): { ok: true } | { ok: false; error: string } {
  const { actorProfileId, target } = input;
  if (target.id === actorProfileId) {
    return { ok: false, error: "You cannot view the app as yourself." };
  }
  if (!isAutoGroupUserRole(target.role)) {
    return { ok: false, error: "Only auto-group users can be viewed as." };
  }
  if (target.status !== "active") {
    return { ok: false, error: "Only active users can be viewed as." };
  }
  if (!target.email?.trim()) {
    return { ok: false, error: "Target user has no email." };
  }
  return { ok: true };
}

/**
 * Throws when the current request is in an impersonation session.
 * Use at the top of mutating server actions.
 */
export async function assertNotImpersonating(): Promise<void> {
  if (await isImpersonating()) {
    throw new Error("View only access — changes are not allowed while viewing as another user");
  }
}

/**
 * True when mutations / write UI should be blocked.
 * Includes real store_viewer roles and owner impersonation sessions.
 * Does NOT control which sidebar links are shown — use isStoreViewer for nav.
 */
export async function isAppViewOnly(role: string | null | undefined): Promise<boolean> {
  if (isStoreViewer(role)) return true;
  return isImpersonating();
}

/** Shared mutate gate: blocks impersonation sessions and store_viewer. */
export async function assertCanMutateAppData(role: string | null | undefined): Promise<void> {
  await assertNotImpersonating();
  if (!canMutateAppData(role)) {
    throw new Error("View only access — changes are not allowed");
  }
}
