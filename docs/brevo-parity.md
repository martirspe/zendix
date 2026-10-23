# Brevo reference and parity status — 2026-10-21

The operator explicitly requested Brevo functionality and interface parity and supplied an authenticated browser session as a visual reference. Inspection was read-only: dashboard/navigation and contact-list controls/typography/density. No Brevo contacts, campaigns, settings or subscriptions were changed. Account records and statistics were not copied into MailCraft.

This pass brings the contact table toward the observed workflow: a contacts heading, creation/import actions, contact/list/attribute tabs, search and subscription/list filters, column customization, contact details, and paging controls. The existing MailCraft brand and available fonts remain; this is not an exact visual replica of the entire Brevo console.

## Current evidence

See core-crud.md for verified operations and html-templates.md for the HTML workflow. The public reference includes contact search/filters/views, customizable columns, lists/segments, bulk actions and campaign setup for sender/audience/subject/design. Contact CRUD, simple lists, custom text fields, pagination, drafts and HTML templates have concrete local implementations and tests.

## Outstanding parity work

- Complete navigation/layout comparison across Marketing, CRM, Library, Analytics and account settings.
- Selection of all filtered contacts beyond the 200-ID limit, folders, richer attribute types and dynamic segments.
- Expand visual email blocks and complete cross-client QA. Scheduling, subject A/B allocation and reporting now have persistent implementations, but automatic winner selection and a second send are not implemented.
- Validate signed provider events and real delivery on the public MailChannels endpoint; link tracking and event-backed analytics are implemented, with custom tracking-domain and public-account verification still outstanding.
- Automation, transactional, SMS/WhatsApp, conversations, deals, commerce and broader account/commercial operations.

The complete Brevo platform and interface have not been reproduced. Those gaps must remain explicit until implemented and verified; external provider credentials and a public application origin are also needed for real delivery/public deployment verification.

## Campaign audience and delivery gate — 2026-10-22

Campaigns persist selected tenant-owned lists. Review calculates a deduplicated count of active, subscribed contacts carrying explicit consent. MailChannels Email API handles previews and API-managed DKIM. Campaign confirmation validates an expiring snapshot token, a current accepted preview, sender DNS, live signed-webhook validation, consented audience and provider-event health; dispatch is durable, recipient-scoped and rechecked immediately before submission. Signed provider events are durably deduplicated and correlated by request ID; hard bounces, complaints and provider unsubscribes suppress contacts. Local verification simulates provider calls and never sends a real campaign. A public HTTPS endpoint, real account credentials and successful challenge against that endpoint remain external verification prerequisites.

References: https://help.brevo.com/hc/en-us/articles/4408399178898-Overview-of-the-Contacts-page and https://help.brevo.com/hc/en-us/articles/4413566705298-Create-and-send-an-email-campaign.

## Access and first-campaign review — current pass

| Feature | Reference / acceptance | Implemented | Remaining gap |
| --- | --- | --- | --- |
| Login | Email/password without a pasted tenant UUID; existing accounts remain accessible | Automatic tenant resolution after password verification; named picker only for multiple matching organizations; existing scoped login remains API-compatible | Exact Brevo login screen comparison remains unverified in the currently available local-only browser session |
| Registration | Initial organization created with the account | Profile names, required terms acceptance, organization created with the account; registration remains environment-controlled; duplicate emails across tenants are supported | Exact Brevo visual comparison; configure and verify production authentication email before enabling public registration |
| Email access | One-time login code, verification and recovery | Tenant-scoped expiring, single-use codes with attempt limits; HMAC token hashes; MailChannels Email API; session revocation on password reset | Production MailChannels auth key/sender and delivered-message browser verification |
| Google sign-in | Official Google Identity Services button on login and registration | Optional GIS button; server verifies signature, audience, issuer, expiry and verified email; terms-gated signup and named workspace selection | A Google OAuth Web Client ID with the deployed hostname authorized; live browser verification |
| Review, immediate/scheduled send and A/B | Current saved design, sender, consented audience, accepted preview, explicit confirmation and timezone-aware scheduling | Tenant-scoped checklist, signed expiring campaign snapshot, durable queue, execution-time sender/consent checks, stable per-contact subject allocation and MailChannels event processing | Automatic winner selection/second send, custom tracking hostname, cross-client QA and live public provider verification remain outstanding |

API smoke checks cover invalid credentials, unknown users, automatic registration, same email/password across tenants, no session before organization choice, wrong organization, different tenant passwords, role enforcement and review isolation. Browser checks confirmed named selection, refresh persistence, save/review and logout using disposable accounts. No real provider account was modified and no email was sent.
