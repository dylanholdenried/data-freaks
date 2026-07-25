#!/usr/bin/env node
/**
 * Apply supabase/migrations/20260725200000_store_access_and_phone.sql via Management API.
 * Requires: SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-store-access-migration.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sqlPath = path.join(
  root,
  "supabase/migrations/20260725200000_store_access_and_phone.sql"
);

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN then re-run.");
  process.exit(1);
}

let projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) {
  const envLocal = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  const m = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=.*?\/\/([^.]+)\./);
  if (!m) {
    console.error("Could not determine project ref");
    process.exit(1);
  }
  projectRef = m[1];
}

const sql = fs.readFileSync(sqlPath, "utf8");
const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  }
);
const text = await res.text();
if (!res.ok) {
  console.error("Apply failed:", res.status, text.slice(0, 2000));
  process.exit(1);
}
console.log("Migration applied OK");
console.log(text.slice(0, 500));
