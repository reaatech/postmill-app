# Media Library

The media library at `/media` is the central hub for all uploaded images, videos, audio, and
documents. It provides folder organisation, file metadata, and bulk operations so your team can
manage media assets across campaigns and channels.

## Folder tree navigation

The left sidebar in the media library displays a hierarchical folder tree backed by the
`MediaFolder` model. Each folder has a `parentId`, enabling an unlimited nesting depth.

- Click any folder to filter the file grid to that folder's contents.
- Click **All Files** at the top to view files across the entire library (unfiltered by folder).
- Folders with children show expand/collapse arrows. The collapsed state persists per session.
- Each folder shows a count of its direct media files.
- Right-click any folder for a context menu with **Rename**, **New Subfolder**, and **Delete**.
- A non-empty folder cannot be deleted; move or delete its contents first.
- Click the **+** button in the folder header to create a new folder at the root level.

## Uploading files

Files upload into the currently selected folder. Two upload methods are supported:

- **Drag and drop**: drag files from your file system onto the media area. The uploader accepts
  images, videos, audio, and documents.
- **File picker**: click the upload button in the toolbar to browse and select files.

Uploads show progress indicators and complete with a success notification.

## Grid / list toggle

Two view modes are available in the top-right toolbar:

| Mode | Description |
|------|-------------|
| **Grid** | Thumbnail tiles showing a preview of each file. Best for visual browsing of images and videos. |
| **List** | Tabular rows with sortable columns: name, type, size, and created date. Click column headers to sort ascending or descending. |

The selected view mode persists for your session.

## File details panel

Click any file to open the details panel on the right side. This panel provides:

| Section | Content |
|---------|---------|
| **Preview** | Image thumbnail (square, aspect-ratio constrained) or video player with controls for `.mp4` files. |
| **Name** | Editable in-place — click to rename, press Enter or click away to save. |
| **Description** | Multi-line text field. Edits save on blur. |
| **Tags** | Add tags by typing and pressing Enter, comma, or Tab. Remove tags by clicking the × icon. Tags persist to the file metadata. |
| **Metadata** | Read-only display of file size (formatted as B/KB/MB), MIME type, and creation date. |
| **Actions** | **Copy URL**, **Download**, **Create Post** (opens the composer with this file attached), and **Delete** (soft-delete to trash). |

## Drag to move between folders

Drag any file thumbnail and drop it onto a folder in the left sidebar to move it. The target
folder highlights in blue. A success notification confirms the move, and both the file grid and
folder counts refresh.

## Bulk actions

When one or more files are selected (checked), a bulk toolbar appears above the grid:

- **Move to Folder** — opens a modal listing all folders; select a target and click Move. Choose
  **Root (no folder)** to move files out of any folder.
- **Delete** — soft-deletes all selected files (they go to the trash).
- **Clear** — deselects all files.

Selection works by clicking the checkbox on file cards (grid view) or rows (list view).

## Search, sort, and pagination

The toolbar provides:

- **Search bar** — searches by file name or tags. Results update with a 300ms debounce as you
  type.
- **Type filter** — dropdown to filter by file type: Images, Videos, Audio, or Documents.
- **Sort** — in list view, click any column header to sort. Click again to reverse sort order.
- **Pagination** — page navigation appears below the grid when results span multiple pages.
  Shows up to 7 page buttons with ellipsis for large result sets. 24 files per page.

## Trash

The **Trash** button in the toolbar opens a modal showing all soft-deleted files:

- Each trashed item shows a thumbnail, file name, and deletion timestamp.
- **Restore** returns the file to the library (it reappears in its previous folder).
- **Delete** permanently removes the file. A confirmation dialog warns that permanent deletion
  cannot be undone.

Soft-delete is the default behaviour when deleting from the file details panel or bulk toolbar.
Permanent deletion is only available from the trash view.

## Storage provider mounting

Root folders in the media library map to configured storage providers. Each `StorageProviderConfig`
record represents a storage backend (S3, R2, B2, IDrive e2, or local disk). When a provider is
mounted, it appears as a root-level folder. Different folders can route to different storage
backends — for example, you might keep active campaign assets on fast local storage and archive
older campaigns to cloud object storage.

Configure storage providers in Settings → Storage. See
[Storage Setup](../operations-guide/storage.md) for provider configuration and quota management.

> Verified against v3.7.0
