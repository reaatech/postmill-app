# Campaigns

Campaigns (v3.5.0) let you organize posts into themed folders. A campaign groups related content
— such as a product launch, event series, or seasonal promotion — and surfaces campaign-aware
analytics, media, and comments.

## Creating a Campaign

1. Navigate to the **Campaigns** page (`/campaigns`).
2. Click **New Campaign**.
3. Fill in the campaign details:
   - **Name**: A descriptive name (e.g., "Summer Product Launch," "Q4 Webinar Series").
   - **Date Range** (optional): Start and end dates for the campaign period.
   - **Color**: A color from the palette. This color tints the campaign's calendar cards for quick
     visual identification.

Existing campaigns appear as a list on the Campaigns page, showing the name, date range, color
swatch, and post count.

## Editing and Deleting

- Click a campaign to edit its name, date range, or color.
- Delete a campaign to remove it. Deleting a campaign sets the `deletedAt` timestamp (soft delete)
  and does not delete the associated posts. Posts with a deleted campaign revert to having no
  campaign assignment (`campaignId = null`).

## Color Tinting on Schedule

When a post is assigned to a campaign, the post card on the schedule is visually distinguished
with the campaign's color on the left border or as a tint overlay. This makes it easy to scan the
schedule and identify which posts belong to which campaign.

On the schedule, you can filter by campaign to show only posts belonging to a specific campaign.

## Composer Integration

When creating or editing a post in the composer, you can assign it to a campaign:

- A **Campaign** dropdown appears in the composer sidebar.
- Select an existing campaign from the list.
- The assignment is recorded as `campaignId` on the post record. The field is nullable — existing
  posts without a campaign remain unassigned.

## Bulk Import Targeting

When importing posts via CSV bulk import, include a `campaign` column to assign imported posts
to a campaign. Each row is validated individually; rows with an invalid `campaign` value report a
warning but do not block the import. See [Bulk Import](./bulk-import.md) for import format and
instructions.

## Campaign-Aware Analytics

Campaign analytics derive **transitively through the post's `campaignId`**. There are no foreign
keys from the analytics tables to the campaign table in v3.5.0; instead, analytics queries join
through the posts table.

On the Campaigns page, each campaign card shows:

- **Post Count**: Total posts in the campaign.
- **Engagement Total**: Sum of engagement metrics (views, likes, comments) across all campaign
  posts, calculated from available analytics snapshots.
- **Date Range**: The campaign's active period.

In the Analytics dashboard, you can filter by campaign to view metrics scoped to that campaign's
posts.

## Media and Comments Grouping

- **Media Library**: Filter media by campaign to see all uploads associated with campaign posts.
  This grouping is transitive through the post's `campaignId`.
- **Comments Inbox**: Filter comments by campaign to triage replies related to a specific campaign.
  Again, grouping is derived through the post.

These campaign-aware filters help you manage all content, media, and engagement for a campaign in
one place.

> Verified against v3.8.3
