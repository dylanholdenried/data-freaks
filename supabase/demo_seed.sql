-- Demo seed data for Data Freaks
-- Safe to expose publicly; used for /demo route with anon RLS access.

-- Dealer group
insert into public.dealer_groups (id, name, website, plan, status, number_of_stores, is_demo, is_active)
values (
  '00000000-0000-0000-0000-000000000001',
  'Freak Auto Group',
  'https://demo.datafreaks.app',
  'paid',
  'active',
  2,
  true,
  true
) on conflict (id) do nothing;

-- Stores
insert into public.stores (id, dealer_group_id, name, code, is_active, is_demo)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Freak Toyota', 'FTY', true, true),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Freak Honda', 'FHN', true, true)
on conflict (id) do nothing;

-- Departments
insert into public.departments (id, store_id, name, is_active, is_demo)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'New', true, true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Used', true, true),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000102', 'New', true, true),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000102', 'Used', true, true)
on conflict (id) do nothing;

-- Salespeople
insert into public.salespeople (id, store_id, first_name, last_name, is_active, is_demo)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'Alex', 'Lopez', true, true),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', 'Jordan', 'Nguyen', true, true),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000101', 'Priya', 'Patel', true, true),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000102', 'Chris', 'Reed', true, true),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000102', 'Morgan', 'Kim', true, true)
on conflict (id) do nothing;

-- Acquisition sources
insert into public.acquisition_sources (id, store_id, name, is_active, is_demo)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101', 'Walk-in', true, true),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000101', 'Website Lead', true, true),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000102', 'Phone Up', true, true),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000102', 'Third-Party Lead', true, true)
on conflict (id) do nothing;

-- Calendar for current month (simplified example; adjust dates as needed)
-- Mark all weekdays in the current month as working days, Sundays closed, Saturdays working.

-- NOTE: In Supabase SQL editor you can adjust this to generate dynamically if desired.

-- Example static for March 2026
insert into public.store_calendar_days (store_id, calendar_date, is_working_day, is_demo)
values
  -- Only a subset; extend if you want full month
  ('00000000-0000-0000-0000-000000000101', '2026-03-01', false, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-02', true, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-03', true, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-04', true, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-05', true, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-06', true, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-07', true, true),
  ('00000000-0000-0000-0000-000000000101', '2026-03-08', false, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-01', false, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-02', true, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-03', true, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-04', true, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-05', true, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-06', true, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-07', true, true),
  ('00000000-0000-0000-0000-000000000102', '2026-03-08', false, true)
on conflict (store_id, calendar_date) do nothing;

-- Deals and deal_salespeople
-- For brevity this seeds a smaller set; you can duplicate/adjust for 60–100 deals.

insert into public.deals (
  id,
  dealer_group_id,
  store_id,
  department_id,
  status,
  trade_status,
  finance,
  customer_last_name,
  sale_date,
  stock_number,
  vehicle_year,
  vehicle_make,
  vehicle_model,
  vin,
  acquisition_source_id,
  front_profit,
  back_profit,
  sale_price,
  odometer,
  age,
  drivetrain,
  body_style,
  is_demo,
  is_active
)
values
  (
    '00000000-0000-0000-0000-000000001001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    'closed',
    'no_trade',
    'prime',
    'Garcia',
    '2026-03-01',
    'FTY1234',
    2024,
    'Toyota',
    'RAV4',
    '1ABCDEFG2H3456789',
    '00000000-0000-0000-0000-000000000401',
    1800,
    900,
    36250,
    12000,
    34,
    'AWD',
    'SUV',
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-000000001002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000202',
    'pending',
    'has_trade',
    'prime',
    'Nguyen',
    '2026-03-03',
    'FTY5678',
    2021,
    'Toyota',
    'Camry',
    '1ABCDEFG2H3456790',
    '00000000-0000-0000-0000-000000000402',
    900,
    600,
    25950,
    34000,
    41,
    'FWD',
    'Sedan',
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-000000001003',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000203',
    'delivered',
    'no_trade',
    'cash',
    'Patel',
    '2026-03-04',
    'FHN1111',
    2024,
    'Honda',
    'Civic',
    '1ABCDEFG2H3456791',
    '00000000-0000-0000-0000-000000000403',
    1300,
    500,
    24400,
    5000,
    12,
    'FWD',
    'Sedan',
    true,
    true
  )
on conflict (id) do nothing;

insert into public.deal_salespeople (deal_id, salesperson_id, share_percent)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000301', 60),
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000302', 40),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000302', 50),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000303', 50),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000304', 100)
on conflict do nothing;

