# Storage Provider Setup

> **Verified against v3.6.0**

Each organization can mount its own storage provider for media uploads. Supported providers: **S3**,
**Cloudflare R2**, **Backblaze B2**, **IDrive e2**, and **Local** (default, filesystem-based).

Storage is configured in **Settings → Storage** via the `StorageProviderConfig` model. Credentials
are encrypted at rest using the `EncryptionService`.

---

## Default Setup (Local Storage)

Out of the box, Postiz uses **Local Storage** — files are written to the directory specified by the
`UPLOAD_DIRECTORY` environment variable (default: `/tmp/postiz-uploads` inside the container, or
`/var/lib/postiz/uploads` in self-hosted setups).

Each organization has a **5 GB quota by default** (`Organization.localStorageQuotaBytes`). To change
the per-org quota, update the `localStorageQuotaBytes` value in the database:

```sql
UPDATE "Organization" SET "localStorageQuotaBytes" = 107374182400 WHERE id = 'org-id';  -- 100 GB
```

Local storage files are kept inside the container or mounted volume. For production, ensure:
1. The mount path is persistent (e.g., Docker volume or EBS).
2. Backups include the upload directory.
3. Disk space is monitored (soft quota enforced at 5 GB, but disk usage can exceed quota if not
   actively enforced).

---

## Cloud Storage Providers

### Amazon S3

**Setup:**

1. Create an **S3 bucket** in the AWS Console.
2. Create an **IAM user** with the following policy (replace `your-bucket` with your bucket name):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:GetObject",
           "s3:PutObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::your-bucket",
           "arn:aws:s3:::your-bucket/*"
         ]
       }
     ]
   }
   ```
3. Generate **Access Key ID** and **Secret Access Key** for the IAM user.
4. In **Settings → Storage**, click **Add Provider** → select **S3**:
   - **Name:** e.g., "My S3 Bucket"
   - **Access Key ID:** (from step 3)
   - **Secret Access Key:** (from step 3)
   - **Region:** e.g., `us-east-1`
   - **Bucket:** `your-bucket`
   - **Public URL** (optional): e.g., `https://s3.amazonaws.com/your-bucket` — if set, media URLs are
     served from this base instead of the S3 SDK's URL generation.
5. Click **Test Connection** to verify credentials.
6. Click **Mount** to activate the provider.

**Files uploaded** to a mounted S3 provider are stored in S3 with the path structure:
`s3://your-bucket/<org-id>/<file-name>`.

---

### Cloudflare R2

**Setup:**

1. Log in to the **Cloudflare Dashboard** → **R2**.
2. Create a **bucket**.
3. Go to **R2 API tokens** → **Create API token**:
   - Grant **Object Read & Write** permissions.
   - Copy the **Access Key ID** and **Secret Access Key**.
4. Note your **Account ID** (visible in the R2 dashboard or in the API token details).
5. In **Settings → Storage**, click **Add Provider** → select **R2**:
   - **Name:** e.g., "My R2 Bucket"
   - **Access Key ID:** (from step 3)
   - **Secret Access Key:** (from step 3)
   - **Account ID:** (from step 4)
   - **Bucket:** `your-bucket` (name only, not a full path)
   - **Region** (optional): defaults to auto-detection; can specify a specific region if needed.
   - **Public URL** (optional): e.g., `https://my-bucket.my-account-id.r2.cloudflarestorage.com` —
     if set, media URLs are served from this custom domain instead of the R2 SDK's default.
6. Click **Test Connection**.
7. Click **Mount** to activate.

---

### Backblaze B2

**Setup:**

1. Log in to **Backblaze B2** → **Create a Bucket**.
2. Go to **App Keys** → **Create Application Key**:
   - Grant **readFiles, writeFiles, deleteFiles, listBuckets, listFiles** permissions for your bucket.
   - Copy the **Application Key ID** and **Application Key**.
3. In **Settings → Storage**, click **Add Provider** → select **B2**:
   - **Name:** e.g., "My B2 Bucket"
   - **Key ID:** (Application Key ID from step 2)
   - **Application Key:** (Application Key from step 2)
   - **Region:** e.g., `us-west-004` (check your bucket's region)
   - **Bucket:** `your-bucket-name`
   - **Public URL** (optional): e.g., `https://f000.backblazeb2.com/file/your-bucket` — if set,
     media URLs are served from this base.
4. Click **Test Connection**.
5. Click **Mount** to activate.

B2 uses S3-compatible APIs, so uploads and downloads work identically to other S3-compatible providers.

---

### IDrive e2

**Setup:**

1. Log in to **IDrive e2** → create a bucket.
2. Go to **Access Keys** → **Create Key**:
   - Grant read/write permissions for your bucket.
   - Copy the **Access Key** and **Secret Key**.
3. In **Settings → Storage**, click **Add Provider** → select **IDrive e2**:
   - **Name:** e.g., "My IDrive e2 Bucket"
   - **Access Key ID:** (Access Key from step 2)
   - **Secret Access Key:** (Secret Key from step 2)
   - **Region:** e.g., `us-east-1`
   - **Bucket:** `your-bucket`
   - **Endpoint** (optional): e.g., `https://region.cloudstorage.ide.com` — IDrive e2's S3-compatible
     endpoint. Defaults to the standard endpoint if not provided.
   - **Public URL** (optional): base URL for serving files (e.g., your CDN or custom domain).
4. Click **Test Connection**.
5. Click **Mount** to activate.

---

## Storage Management

### Mount & Unmount

- **Mount** → makes the provider active for new uploads; creates a root folder in the media manager
  with the provider's name and icon.
- **Unmount** → marks the provider as inactive; existing files remain accessible but new uploads don't
  use it. If the mount folder is empty, it's deleted; otherwise it's detached (no longer tied to the
  provider).

### File Migration

To migrate files from one provider to another (e.g., local → S3):

1. Go to **Settings → Storage** → select the **source provider** (e.g., Local).
2. Click **Migrate to…** → select the **target provider** (e.g., S3).
3. A preview shows the file count and total size.
4. Click **Start Migration** → files are copied in batches with per-file error reporting.
   - Successful migrations: file path is updated in the database and the source is deleted.
   - Failed migrations: the source file is kept; you can retry the migration later.
5. Monitor progress from the modal or check the **Storage → Audit Log** tab for details.

### Health Tracking

Each provider is tested on creation and can be manually tested via the **Test Connection** button in
the Storage settings. The health check result is stored:
- **Last Checked:** timestamp of the last test.
- **Last Error:** if the test failed, the error message.

UI badges show:
- 🟢 **Connected** — test succeeded recently.
- 🟡 **Untested** — never tested or test result is old.
- 🔴 **Failed** — last test failed; check the error message and reconfigure credentials if needed.

### Quota & Usage

- **Storage → Quota Status** tab shows your organization's total usage vs. quota.
- **Storage → Usage Breakdown** tab shows usage by folder and by provider.
- At **80% quota usage**, a warning banner appears in the storage UI.
- At **100% quota usage**, uploads are blocked (413 Payload Too Large).

---

## Folder-Level Provider Routing

By default, uploads go to the **first mounted provider** (or local if none mounted). To assign a
specific provider to a folder:

1. Go to **Settings → Storage**.
2. Select a provider card → click **Set Default Folder**.
3. Pick a folder from the media manager → confirm.
4. From now on, **all uploads to that folder use the assigned provider**.

This is useful for organizing uploads: e.g., "all images to R2, all videos to local" or "all client
assets to S3".

---

## Environment Variable Fallback (Deprecated)

For backward compatibility, the following env vars are still read but **deprecated**:

```bash
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ACCESS_KEY
CLOUDFLARE_SECRET_ACCESS_KEY
CLOUDFLARE_BUCKETNAME
CLOUDFLARE_BUCKET_URL
CLOUDFLARE_REGION
STORAGE_PROVIDER
```

If these are set and no `StorageProviderConfig` is configured in the database, Postiz creates a
fallback local or Cloudflare R2 provider on startup. **A deprecation warning is logged at boot.**

**Migrate to database configuration** by:
1. Setting up a new provider in **Settings → Storage**.
2. Testing the connection.
3. Mounting the provider.
4. Migrating files from the old env-based provider.
5. Removing the env vars.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Test Connection failed: InvalidAccessKeyId" | Verify Access Key ID and Secret. Check IAM permissions (S3) or role restrictions (R2). |
| "Bucket not found" | Ensure the bucket exists and the key has access to it. Check the region. |
| "Public URL not working" | Verify the base URL is correct and the bucket/domain is public (or CDN is configured). |
| "Upload blocked: Storage quota exceeded" | Check **Storage → Quota Status**. Free up space by deleting old files or deleting trashed files. |
| "Provider marked as failed" | Click **Test Connection** to retry. Fix credentials if needed. |

---

## Security & Best Practices

1. **Use IAM roles with minimal permissions** — don't use root/master keys. Create keys that only
   access the specific bucket.
2. **Rotate keys regularly** — update the stored credentials in **Settings → Storage** when you rotate
   provider keys.
3. **Use HTTPS for public URLs** — always serve files over HTTPS to avoid man-in-the-middle attacks.
4. **Enable bucket encryption** (optional but recommended) — S3/R2/B2/IDrive e2 all support encryption
   at rest.
5. **Monitor access logs** — configure provider access logging (S3 access logs, R2 bucket analytics,
   etc.) to track who accessed what.
