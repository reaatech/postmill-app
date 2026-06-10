# Media Manager

The Media Manager provides a full file management interface for your social media assets, organized
in folders with tags, bulk operations, and a trash bin.

## Core Features

- **Folder tree** — organize media in a hierarchical folder structure with collapsible navigation.
  Drag files from the grid onto folders to move them.
- **File grid/list toggle** — switch between thumbnail grid and detailed list views.
- **File details panel** — view metadata, tags, description, and preview for each file.
- **Bulk actions** — select multiple files for batch operations (move, delete, tag).
- **Search, sort, and pagination** — find assets by name/tag, filter by type, sort by date/size/name.
- **Upload** — upload files targeting the currently selected folder.
- **Trash & restore** — delete files with a soft-delete (recoverable); view trashed files in the trash
  modal (🗑️ Trash button in the toolbar); restore to original folder or permanently delete.

## Storage Providers & Folder Routing

See [Storage Setup Guide](../self-hosting/storage.md) for configuring S3, R2, Backblaze B2,
or IDrive e2 as per-tenant storage backends.

Per-tenant storage providers mount as root folders in the media manager (e.g., "My S3 Bucket" appears
as a top-level folder with an S3 icon). You can:

1. **Migrate files between providers** (e.g., local → S3) from the **Storage** settings tab using the
   migration feature with a progress bar and per-file error reporting.
2. **Assign a default provider to a folder** so all uploads to that folder automatically use that provider.
   Configure this in the **Storage** settings tab on each provider card: **Set Default Folder** action.
   This is useful for organizing uploads: e.g., "all images to S3, all videos to local".

## Models

- `Media` — files with `folderId` (nullable FK to folder), `tags` (JSON string[]), `description` (text),
  `fileSize`, `type`, `thumbnail`, `alt`, `deletedAt` (soft-delete timestamp; null = active).
- `MediaFolder` — folders with `parentId` (for nesting), `name`, `tags`, `color`, `storageProviderId`
  (FK to assigned provider, or null for local/unassigned).
