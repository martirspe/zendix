# Core CRUD verification — 2026-10-21

## Implemented scope

| Resource | Create/read | Update | Removal | UI |
| --- | --- | --- | --- | --- |
| Contacts | Manual creation, CSV batches, detail and server-paginated search/filter | Name and existing custom text values | Reversible archive; unsubscribe state retained on restore | Contacts table, detail dialog, archive filter and confirmations |
| Lists | Named lists and active membership counts | Rename, add/remove owned contacts | Delete associations/list while keeping contacts | Lists tab and contact detail memberships |
| Contact attributes | Tenant-specific text definitions | Rename label; stable key | Delete unused fields; used fields return conflict | Attributes tab and import mapping |
| Campaign drafts | Create, detail and server-paginated search | Subject/preheader/document | Delete only drafts without test/dispatch history | Existing editor plus delete confirmation/pagination |
| HTML templates | Reusable library/detail | Name and HTML source | Delete library entry; campaign snapshots unaffected | Library edit/delete/new actions |
| Sender domains | Create/read and DNS checks | Diagnostic state refreshed by check; hostname is the ownership identity | Remove unconfigured domains; configured SMTP sender is protected | Domain removal confirmation |

Accounts, roles, delivery events, subscriptions and provider secrets have dedicated authorization/lifecycle flows. This pass does not introduce generic deletion or editing of authentication records, consent history, delivery logs or external DNS. SMTP/provider-event/bulk dispatch gates remain in place.

## Pagination

Contacts support 25/50/100 rows, visible range/total, numbered pages, first/last/previous/next, stable created_at/id sorting, search by email/name, subscription/archive/list filters and empty/error/loading states. Page/count queries share a repeatable-read transaction. Filters reset to page one, out-of-range pages clamp after removal, and response sequencing prevents old requests overwriting newer results. Column visibility/order preferences are stored per tenant in the browser. Campaigns also have bounded server pagination and name/subject search.

## Data protection

Contact email is an immutable identity for edit operations. Attribute patches merge without replacing consent metadata. Archiving changes subscribed contacts to unsubscribed and preserves bounce/complaint states with guarded writes; restoring does not resubscribe. CSV import skips archived/existing emails. SMTP checks archive state both on request and immediately before submission. Every CRUD query uses the verified tenant context; viewer mutations remain forbidden. Destructive UI actions use native confirmation dialogs with inline errors.

## Migration and verification

Migration 202610210005_contact_archive adds one nullable archived_at column to Contact. It does not drop, rename, backfill or reset existing data. Apply migrations and regenerate Prisma before running the updated application. Keeping the additive column permits application rollback, but an older application does not understand archival semantics and must not resume sending. Preserve the current suppression states.

Docker validation covers Angular/NestJS strict builds, Prisma schema validation, 22 unit tests, and expanded API smoke checks for CRUD, filter bounds, paging ranges, stable disjoint pages, tenant isolation, role restrictions, list membership, used-field conflicts and archive/restore suppression. The isolated SMTP smoke checks archived-recipient rejection without external mail. Test fixtures are synthetic and cleaned afterward.

The migration was additionally applied with all preceding migrations to a newly created isolated database, which was removed afterward. Browser checks covered table/filter controls, native edit/list dialogs and validation without importing or creating real contacts.


## Bulk actions and saved views — 2026-10-21

Contact selection persists across pages, is cleared when filters change and is capped at 200 explicit IDs. Bulk archive, unsubscribe, list addition and removal validate all tenant ownership before a serializable transaction; invalid or foreign IDs produce no partial writes. Suppression states remain intact. Saved views (up to 20 per tenant) persist search/status/list/archive filters, page size and custom column order. Viewers can read and apply views; mutations remain forbidden. Migration 202610210006_contact_views is additive.

Browser verification used a disposable 53-contact workspace: selected 25 contacts on each of two pages, added all 50 to a list, saved and reapplied a filtered 50-row view, reloaded authentication and checked read-only controls after a role change. Database assertions confirmed 50 memberships and persisted view settings. Synthetic workspace and credentials were removed after logout. A final screenshot of the empty demo console was captured and inspected; the populated fixture workflow was verified through browser controls and database assertions, not pixel parity. All 22 unit tests, the expanded API smoke suite, Angular/Nest builds and Prisma validation passed. All six migrations also deployed successfully to an isolated disposable database.
