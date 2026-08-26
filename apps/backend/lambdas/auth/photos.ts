import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { reportError } from '@branch/lambda-http';

const REGION = process.env.AWS_REGION ?? 'us-east-2';
const BUCKET = process.env.REPORTS_BUCKET_NAME ?? '';
const s3 = new S3Client({ region: REGION });

/** Must match the prefix the users lambda writes to (users/photos.ts). */
const AVATAR_PREFIX = 'avatars/';

/**
 * Turns the stored `profile_image` into something an `<img>` can load.
 *
 * The bucket blocks all public access, so a stored key has to be presigned for
 * every read. Absolute URLs are passed through untouched so rows written before
 * profile photos existed keep working, and a signing failure returns the stored
 * value rather than throwing -- a broken avatar must not turn `/auth/me` into a
 * 500 and log the user out.
 */
export async function resolveProfileImage(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith(AVATAR_PREFIX)) return stored;

  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: stored }), {
      expiresIn: 900,
    });
  } catch (err) {
    // Degrading to a broken <img> is deliberate, but a bucket or IAM problem
    // that breaks every avatar should still be visible somewhere.
    reportError(err, { key: stored });
    return stored;
  }
}
