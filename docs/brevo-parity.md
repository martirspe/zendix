# Brevo reference and parity status — 2026-10-21

The operator explicitly requested Brevo functionality and interface parity and supplied an authenticated browser session as a visual reference. Inspection was read-only: dashboard/navigation and contact-list controls/typography/density. No Brevo contacts, campaigns, settings or subscriptions were changed. Account records and statistics were not copied into MailCraft.

This pass brings the contact table toward the observed workflow: a contacts heading, creation/import actions, contact/list/attribute tabs, search and subscription/list filters, column customization, contact details, and paging controls. The existing MailCraft brand and available fonts remain; this is not an exact visual replica of the entire Brevo console.

## Current evidence

See core-crud.md for verified operations and html-templates.md for the HTML workflow. The public reference includes contact search/filters/views, customizable columns, lists/segments, bulk actions and campaign setup for sender/audience/subject/design. Contact CRUD, simple lists, custom text fields, pagination, drafts and HTML templates have concrete local implementations and tests.

## Outstanding parity work

- Complete navigation/layout comparison across Marketing, CRM, Library, Analytics and account settings.
- Selection of all filtered contacts beyond the 200-ID limit, folders, richer attribute types and dynamic segments.
- Audience/sender/review/scheduling/A-B campaign workflow, expanded visual email blocks and cross-client QA.
- Verified provider delivery/bounce/complaint events, bulk dispatch, tracking and real analytics.
- Automation, transactional, SMS/WhatsApp, conversations, deals, commerce and broader account/commercial operations.

The complete Brevo platform and interface have not been reproduced. Those gaps must remain explicit until implemented and verified; external provider credentials and a public application origin are also needed for real delivery/public deployment verification.

References: https://help.brevo.com/hc/en-us/articles/4408399178898-Overview-of-the-Contacts-page and https://help.brevo.com/hc/en-us/articles/4413566705298-Create-and-send-an-email-campaign.

## Access and first-campaign review — current pass

| Feature | Reference / acceptance | Implemented | Remaining gap |
| --- | --- | --- | --- |
| Login | Email/password without a pasted tenant UUID; existing accounts remain accessible | Automatic tenant resolution after password verification; named picker only for multiple matching organizations; existing scoped login remains API-compatible | Exact Brevo login screen comparison remains unverified in the currently available local-only browser session |
| Registration | Initial organization created with the account | Optional API workspace label; UI automatically creates the organization; registration still environment-controlled | Confirmation/reset flows and public registration release gates |
| Review | Actual saved design, subject, sender, contact state and preview evidence | Authenticated tenant-scoped review endpoint and editor checklist, with no fake delivery success | Audience selection and bulk dispatch/provider-event verification remain incomplete |

API smoke checks cover invalid credentials, unknown users, automatic registration, same email/password across tenants, no session before organization choice, wrong organization, different tenant passwords, role enforcement and review isolation. Browser checks confirmed named selection, refresh persistence, save/review and logout using disposable accounts. No real provider account was modified and no email was sent.
