/**
 * Some DBs use `profiles.user_id` → auth.users (canonical).
 * Legacy setups used `profiles.id` = auth user UUID with no `user_id`.
 * PostgREST `or` filter matches either.
 */
export function profileMatchAuthUserId(userId: string) {
  return `user_id.eq.${userId},id.eq.${userId}`;
}
