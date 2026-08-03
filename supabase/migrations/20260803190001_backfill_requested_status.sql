-- Backfill: pending signup requests that created invited profiles → requested.
update public.profiles p
set status = 'requested'
from public.dealer_group_requests r
where r.status = 'pending'
  and p.status = 'invited'
  and (
    r.requested_user_id = p.user_id
    or r.requested_user_id = p.id
  );
