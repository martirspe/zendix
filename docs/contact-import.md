# CSV contact import

The console reads the file locally before confirmation. Supported separators are comma, semicolon, tab and pipe, with automatic detection and a manual override. UTF-8, BOM-marked UTF-16 and Windows-1252 exports are supported. Excel `sep=` directives are recognized. Blank or repeated headers receive unique display labels so each column remains mappable.

Map one column to Email, optionally one to Nombre, and map other columns to an existing custom text field, a new custom text field or No importar. Custom text values are stored in `Contact.attributes.customFields`; definitions belong to the authenticated tenant. Limits: 5 MB, 50,000 contacts, 100 CSV columns, 100 custom fields, 100 characters per name and 2,000 characters per custom value.

Confirmation requires explicit operator consent. Requests contain at most 200 rows; each database batch is atomic. Invalid email/value rows are counted and skipped. Existing email addresses are skipped without changing data, consent or subscription status. Progress advances after confirmed batches. If interrupted, already completed batches remain; repeating the import does not duplicate existing contacts. No email is sent by importing.

Contact browsing supports 25/50/100 records per page, server-side search and status/list/archive filters, numbered navigation and filtered totals. Custom fields are visible as columns and are available for later mapping. The demonstration stores data only in the labeled local browser mode.

Migration `202610210004_contact_fields` only adds a table, its composite tenant/key primary key and tenant foreign key. Existing contacts and attributes are not altered. Apply the migration and generate Prisma before starting the updated API. Rolling back the application does not require dropping this additive table.

Verification uses synthetic fixtures. The supplied operator file was parsed read-only: semicolon separator, EMAIL/APELLIDOS/NOMBRE headers and 17,668 nonempty records. Its contents were not imported, logged or committed.
