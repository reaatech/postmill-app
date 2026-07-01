# Campaigns

Campaigns are org-scoped command centers for organizing, planning, and reporting on a set of
related social posts. A campaign groups posts together with tags (channels, brands, files, VPNs,
LLMs, storage, sets, signatures), goals, drafts, and a shareable report.

> Verified against v3.9.0

## Creating a Campaign

1. Navigate to the **Campaigns** page (`/campaigns`).
2. Click **New Campaign**.
3. Fill in the campaign details:
   - **Name**: A descriptive name (e.g., "Summer Product Launch").
   - **Date Range** (optional): Start and end dates.
   - **Color**: A color that tints campaign cards in the schedule and report header.
   - **Auto-append UTM tags**: When enabled, links in campaign posts receive
     `utm_campaign`, `utm_source`, and `utm_medium` before short-linking.
   - **Goals & Targets** (optional): Add targets for impressions, likes, comments, clicks, posts,
     or followers; progress appears on the dashboard.

Existing campaigns appear as cards on the Campaigns page with post count and engagement totals.

## Campaign Dashboard

Click a campaign card to open its dashboard (`/campaigns/:id`). The dashboard shows:

- **Header**: name, dates, status, and actions (Edit, Copy, Archive, Delete, Export, Share).
- **KPIs**: total views, likes, comments, clicks, state counts, and goal-progress bars. The
  **Comments** KPI (and a `comments` goal) counts the campaign's **synced, replyable comments** —
  the same number shown in the Comments section — not the platform-reported engagement total.
- **Tagged Items**: quick-access panels for each entity type attached to the campaign. Use the
  "Add items" picker to tag channels, brands, files, VPNs, LLMs, storage, sets, or signatures.
- **Posts**: a table of all campaign posts with engagement.
- **Planning Workspace**: campaign drafts, approval status, and promote actions.
- **Comments**: view and reply to every synced comment across the campaign's posts (see below).
- **Changelog**: recent activity such as added tags, copies, approvals, and promotions.

## Campaign Comments

The dashboard's **Comments** section is a full comment-management surface scoped to the campaign's
posts — no need to open each post or the standalone inbox:

- **Filter** by status (All / Needs Reply / Handled / Ignored), by **channel**, by **assignee**, or
  to **unread only**.
- **Reply** inline (with optional AI draft), **like**, cycle a comment's **status**, **assign** it to
  a teammate, or **mark handled** — individually or in bulk via row selection.
- Each comment shows its author, channel badge, content, and the post it belongs to.

Replies are posted to the live platform, so a channel must support comment replies for the action to
succeed.

## Discussion

Below the tabs, the **Discussion** section is an internal, team-only thread for talking *about* the
campaign — separate from the platform **Comments** above (which sync from your social posts). Nothing
here is ever published or shown on a public report.

- Write with a **rich-text editor**: bold, italic, underline, strike, headings, bullet/numbered lists,
  links, and emoji.
- **Embed media** — click the image button to pick a photo or video from your media library and drop
  it right into the note.
- **@mention** a teammate to notify them (respecting their notification preferences).
- **React** with emoji, **reply** to a note (one level of threading), **pin** an important note to the
  top, or **resolve** one to grey it out once it's handled.
- **Edit or delete** your own notes; each note shows the author, avatar, and how long ago it was
  posted (with an "edited" marker when changed).

## Planning Workspace and Draft Approval

Drafts created inside a campaign start with approval status **Pending**. A draft must be marked
**Approved** before it can be promoted to the real publishing schedule:

- **Approve / Reject** per draft, or in bulk via row selection.
- **Promote** moves approved drafts from `DRAFT` to `QUEUE`. Promote a single draft from its row
  actions, or promote many selected drafts with the bulk **Promote Selected** button.
- Rejected drafts stay in the workspace and can be approved later.

## Copy / Clone a Campaign

Use **Copy** on the dashboard header or campaign card to clone a campaign:

- Choose a name for the clone.
- **Shift dates by +1 month** optionally moves the campaign dates and cloned draft publish dates.
- **Reset schedule** drafts the clones for "now" instead of shifting.
- The clone re-tags all non-post items and copies only **draft** posts; published or scheduled
  posts are not duplicated.

## Reports and Public Share

From the dashboard or `/campaigns/:id/report`:

- **Download CSV** or **Download PDF** (server-side rendered).
- **Share link**: enable a public, read-only report at `/public/campaign-report/:token`. The link
  exposes only campaign name/dates, KPIs, goals, post titles/content/metrics, channel breakdown,
  and tagged-item names — no credentials, config, or internal ids. Disable sharing at any time.

## Composer and Bulk Import

- The composer sidebar includes a **Campaign** dropdown. Assigning a post records `campaignId` on
  the post.
- Bulk import accepts a `campaign` column; rows with an invalid campaign value report a warning but
  do not block the import. See [Bulk Import](./bulk-import.md).

## Media and Comments Grouping

Campaign-aware filters derive through the post's `campaignId`: the Media Library groups a campaign's
uploads, and the dashboard's [Campaign Comments](#campaign-comments) section manages replies for the
campaign in one place (the standalone Comments Inbox covers all channels org-wide).

## Purging Old Tags

A daily cron (`campaign-tag-purge`) deletes a finished campaign's tagged items `CAMPAIGN_PURGE_DAYS`
(default 30) after its `endDate`. Ongoing campaigns with no end date are never purged.
