-- Placeholder finance type for historical bulk imports until dealers send real classifications.
alter type public.finance_type add value if not exists 'bulk_upload';
