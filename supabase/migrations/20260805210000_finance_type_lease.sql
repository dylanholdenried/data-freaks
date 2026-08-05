-- Add lease as a finance_type for deal classification (e.g. Jim Butler Auto Group).
-- Must be its own migration: new enum values cannot be used until committed.
alter type public.finance_type add value if not exists 'lease';
