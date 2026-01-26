#!/usr/bin/env node

/**
 * Database Verification Script
 * Verifies that all Phase 1A tables were created successfully
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDatabase() {
  console.log('\n🔍 Verifying Autoura Database Setup...\n');

  const checks = [];

  // 1. Check Tenants Table
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log('✅ Tenants table exists');
      console.log(`   └─ Default tenant: ${data[0].company_name} (${data[0].business_type})`);
      checks.push({ name: 'tenants', status: 'ok', data: data[0] });
    } else {
      console.log('⚠️  Tenants table exists but is empty');
      checks.push({ name: 'tenants', status: 'empty' });
    }
  } catch (error) {
    console.log('❌ Tenants table check failed:', error.message);
    checks.push({ name: 'tenants', status: 'error', error: error.message });
  }

  // 2. Check B2C Quotes Table
  try {
    const { error } = await supabase
      .from('b2c_quotes')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows, which is ok

    console.log('✅ B2C Quotes table exists');
    checks.push({ name: 'b2c_quotes', status: 'ok' });
  } catch (error) {
    console.log('❌ B2C Quotes table check failed:', error.message);
    checks.push({ name: 'b2c_quotes', status: 'error', error: error.message });
  }

  // 3. Check B2B Quotes Table
  try {
    const { error } = await supabase
      .from('b2b_quotes')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') throw error;

    console.log('✅ B2B Quotes table exists');
    checks.push({ name: 'b2b_quotes', status: 'ok' });
  } catch (error) {
    console.log('❌ B2B Quotes table check failed:', error.message);
    checks.push({ name: 'b2b_quotes', status: 'error', error: error.message });
  }

  // 4. Check Itineraries Table
  try {
    const { error } = await supabase
      .from('itineraries')
      .select('id, tenant_id')
      .limit(1);

    if (error && error.code !== 'PGRST116') throw error;

    console.log('✅ Itineraries table exists (with tenant_id)');
    checks.push({ name: 'itineraries', status: 'ok' });
  } catch (error) {
    console.log('❌ Itineraries table check failed:', error.message);
    checks.push({ name: 'itineraries', status: 'error', error: error.message });
  }

  // 5. Check Clients Table
  try {
    const { error } = await supabase
      .from('clients')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') throw error;

    console.log('✅ Clients table exists');
    checks.push({ name: 'clients', status: 'ok' });
  } catch (error) {
    console.log('❌ Clients table check failed:', error.message);
    checks.push({ name: 'clients', status: 'error', error: error.message });
  }

  // 6. Check B2B Partners Table
  try {
    const { error } = await supabase
      .from('b2b_partners')
      .select('id, tenant_id')
      .limit(1);

    if (error && error.code !== 'PGRST116') throw error;

    console.log('✅ B2B Partners table exists (with tenant_id)');
    checks.push({ name: 'b2b_partners', status: 'ok' });
  } catch (error) {
    console.log('❌ B2B Partners table check failed:', error.message);
    checks.push({ name: 'b2b_partners', status: 'error', error: error.message });
  }

  // 7. Test Quote Number Generation
  try {
    const { data, error } = await supabase
      .rpc('generate_b2c_quote_number');

    if (error) throw error;

    console.log('✅ B2C quote number generation works');
    console.log(`   └─ Sample: ${data}`);
    checks.push({ name: 'b2c_quote_number_function', status: 'ok', sample: data });
  } catch (error) {
    console.log('❌ B2C quote number generation failed:', error.message);
    checks.push({ name: 'b2c_quote_number_function', status: 'error', error: error.message });
  }

  try {
    const { data, error } = await supabase
      .rpc('generate_b2b_quote_number');

    if (error) throw error;

    console.log('✅ B2B quote number generation works');
    console.log(`   └─ Sample: ${data}`);
    checks.push({ name: 'b2b_quote_number_function', status: 'ok', sample: data });
  } catch (error) {
    console.log('❌ B2B quote number generation failed:', error.message);
    checks.push({ name: 'b2b_quote_number_function', status: 'error', error: error.message });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  const okCount = checks.filter(c => c.status === 'ok').length;
  const totalCount = checks.length;

  if (okCount === totalCount) {
    console.log(`✅ All checks passed! (${okCount}/${totalCount})`);
    console.log('\n🎉 Database is ready for Phase 1A implementation!');
    console.log('\nNext steps:');
    console.log('  1. Create B2C Quotes API routes');
    console.log('  2. Create B2B Quotes API routes');
    console.log('  3. Update WhatsApp Parser with quote type selector');
    return true;
  } else {
    console.log(`⚠️  ${okCount}/${totalCount} checks passed`);
    console.log('\nPlease review the errors above and fix them before proceeding.');
    return false;
  }
}

// Run verification
verifyDatabase()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
