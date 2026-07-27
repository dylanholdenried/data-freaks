# Data Freaks roadmap

Follow-ups deferred from recent work. Check items off when done.

## Email / Resend

- [ ] **Set up Resend for activation emails**
  - Create a Resend account and verify a sending domain.
  - Add to Vercel (Production + Preview) and `.env.local`:
    - `RESEND_API_KEY`
    - `EMAIL_FROM` (e.g. `Data Freaks <onboarding@yourdomain.com>`)
  - Code is already wired: [`lib/email/resend.ts`](lib/email/resend.ts) sends on **Activate Auto Group** ([`app/admin/provision-actions.ts`](app/admin/provision-actions.ts)).
  - Without these vars, activate still succeeds but shows an email warning on the group page.
  - Verify: activate a test request → inbox gets “Your Data Freaks account is active” with `/login` CTA.
