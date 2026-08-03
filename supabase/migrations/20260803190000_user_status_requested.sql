-- Add "requested" profile status for public signup applicants (distinct from admin-invited).
-- Must be its own migration: new enum values cannot be used until committed.
alter type user_status add value if not exists 'requested';
