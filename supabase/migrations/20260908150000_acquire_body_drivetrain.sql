-- Add body_style and drivetrain to Acquire purchases (align with Sales Registry deals).

alter table public.acq_purchases
  add column if not exists body_style text,
  add column if not exists drivetrain text;

comment on column public.acq_purchases.body_style is 'Same option set as deals.body_style (lib/vehicle BODY_STYLES)';
comment on column public.acq_purchases.drivetrain is 'Same option set as deals.drivetrain (lib/vehicle DRIVETRAINS)';
