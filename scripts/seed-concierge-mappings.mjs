// Seed the concierge brand→tenant mappings + per-tenant concierge feature flag.
// Does exactly what POST /api/super-admin/concierge-brands would do (no UI page
// exists yet for it). Idempotent: upserts mappings, updates/inserts features.
//
//   node scripts/seed-concierge-mappings.mjs           # read-only (default)
//   node scripts/seed-concierge-mappings.mjs --apply   # write
//
// READ-ONLY BY DEFAULT. This script targets whatever .env.local points at —
// which on this project is the LIVE database, and the mappings name four real
// agencies. It used to APPLY by default with --list as the opt-in, the
// inverse of every other seed script here; a reflexive run flipped live
// tenants' concierge routing (A-item 23).
//
// Rollback:
//   DELETE FROM concierge_brand_mappings WHERE brand_key IN
//     ('travel2egypt','affordegypt','sawa','sillage');
//   UPDATE tenant_features SET concierge_enabled = false WHERE tenant_id IN (…);
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required (.env.local)');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// brand_key (what t2e sends) → tenant email (stable key from the tenants list)
const BRAND_TO_EMAIL = {
  travel2egypt: 'hello@travel2egypt.org',
  affordegypt: 'hello@affordegypt.com',
  sawa: 'hello@sawatours.org',
  sillage: 'hello@sillage-egypte.com',
};

const listOnly = !process.argv.includes('--apply');
console.log(`target: ${new URL(url).host} — ${listOnly ? 'READ-ONLY (pass --apply to write)' : 'APPLYING'}`);

const { data: tenants, error: tErr } = await supabase.from('tenants').select('*');
if (tErr) throw tErr;

// Locate the email-bearing column dynamically (schema-agnostic).
const emailKey = Object.keys(tenants[0] ?? {}).find(
  (k) => k.includes('email') && tenants.some((t) => typeof t[k] === 'string' && t[k].includes('@')),
);
if (!emailKey) throw new Error(`no email column found; tenant keys: ${Object.keys(tenants[0] ?? {})}`);
console.log(`tenants: ${tenants.length} (email column: ${emailKey})`);

for (const [brand, email] of Object.entries(BRAND_TO_EMAIL)) {
  const tenant = tenants.find((t) => (t[emailKey] ?? '').toLowerCase() === email);
  if (!tenant) {
    console.log(`brand=${brand.padEnd(12)} ✗ no tenant with ${email} — SKIPPED`);
    continue;
  }

  if (listOnly) {
    console.log(`brand=${brand.padEnd(12)} would map → ${tenant.id} (${email})`);
    continue;
  }

  // 1. mapping (upsert on the unique brand_key)
  const { error: mErr } = await supabase
    .from('concierge_brand_mappings')
    .upsert({ brand_key: brand, tenant_id: tenant.id, active: true }, { onConflict: 'brand_key' });
  if (mErr) throw new Error(`mapping ${brand}: ${mErr.message}`);

  // 2. feature flag (no unique on tenant_id → select-then-update/insert)
  const { data: feat } = await supabase
    .from('tenant_features')
    .select('id, concierge_enabled')
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (feat) {
    const { error } = await supabase
      .from('tenant_features')
      .update({ concierge_enabled: true })
      .eq('id', feat.id);
    if (error) throw new Error(`features update ${brand}: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('tenant_features')
      .insert({ tenant_id: tenant.id, concierge_enabled: true });
    if (error) throw new Error(`features insert ${brand}: ${error.message}`);
  }
  console.log(`brand=${brand.padEnd(12)} ✓ mapped → ${tenant.id} (${email}), concierge_enabled=true`);
}

// Read-back
const { data: mappings } = await supabase
  .from('concierge_brand_mappings')
  .select('brand_key, tenant_id, active')
  .order('brand_key');
console.log('\nconcierge_brand_mappings now:');
for (const m of mappings ?? []) console.log(`  ${m.brand_key.padEnd(12)} → ${m.tenant_id} active=${m.active}`);
