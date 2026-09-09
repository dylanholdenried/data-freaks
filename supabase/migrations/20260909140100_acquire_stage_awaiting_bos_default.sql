-- Default new purchases to Awaiting BOS (enum value added in prior migration).

alter table public.acq_purchases
  alter column stage set default 'awaiting_bos';

comment on type public.acq_purchase_stage is
  'Acquire purchase pipeline stages; awaiting_bos is first (BOS paperwork before stock-in)';
