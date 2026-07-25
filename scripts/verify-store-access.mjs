#!/usr/bin/env node
/**
 * Verify store-access migration + role wiring (service role).
 * Does not print secrets.
 *
 *   node scripts/verify-store-access.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(path.join(root, ".env.local"), "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const failures = [];

const { error: phoneErr } = await supabase.from("profiles").select("phone").limit(1);
if (phoneErr) failures.push(`profiles.phone missing: ${phoneErr.message}`);
else console.log("OK profiles.phone");

const { error: rpcErr } = await supabase.rpc("has_store_access", {
  p_store_id: "00000000-0000-0000-0000-000000000000",
});
if (rpcErr) failures.push(`has_store_access missing: ${rpcErr.message}`);
else console.log("OK has_store_access()");

const emails = [
  "dylanholdenried@gmail.com",
  "dholdenried@jimbutlerautogroup.com",
];
const { data: profiles, error: pErr } = await supabase
  .from("profiles")
  .select("id, email, role, status, dealer_group_id, phone")
  .in("email", emails);
if (pErr) failures.push(`profiles query: ${pErr.message}`);
else {
  for (const p of profiles ?? []) {
    console.log(`OK profile ${p.email} role=${p.role} status=${p.status}`);
  }
  const gmail = profiles?.find((p) => p.email === "dylanholdenried@gmail.com");
  const work = profiles?.find((p) => p.email === "dholdenried@jimbutlerautogroup.com");
  if (gmail?.role !== "platform_admin") failures.push("gmail should be platform_admin");
  if (work?.role !== "group_admin") failures.push("work should be group_admin");
}

const { data: group } = await supabase
  .from("dealer_groups")
  .select("id, name")
  .eq("name", "Jim Butler Auto Group")
  .maybeSingle();

if (!group) failures.push("Jim Butler Auto Group not found");
else {
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .eq("dealer_group_id", group.id)
    .order("name");
  console.log(`OK group stores (${stores?.length ?? 0}): ${(stores ?? []).map((s) => s.name).join(", ")}`);
}

const { error: usaErr } = await supabase.from("user_store_access").select("id").limit(1);
if (usaErr) failures.push(`user_store_access: ${usaErr.message}`);
else console.log("OK user_store_access readable");

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("PASS");
