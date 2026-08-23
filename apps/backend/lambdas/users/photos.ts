import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION ?? 'us-east-2';
const BUCKET = process.env.REPORTS_BUCKET_NAME ?? '';
const s3 = new S3Client({ region: REGION });

/** Profile photos share the reports bucket, under their own prefix. */
export const AVATAR_PREFIX = 'avatars/';

// Only the formats a browser renders inline. The extension picks the
// Content-Type because the presigned PUT must be signed for the exact value the
// browser will send, and the client cannot be trusted to state it.
const AVATAR_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const AVATAR_EXTENSIONS = Object.keys(AVATAR_CONTENT_TYPES);

/** `null` for anything not in the allowlist, which callers turn into a 400. */
export function avatarContentType(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? (AVATAR_CONTENT_TYPES[extension] ?? null) : null;
}

/**
 * Keyed by user so a photo cannot be written over another user's, and
 * timestamped so replacing a photo never serves a cached previous one.
 * The file name is not interpolated: a name like `../../x` would otherwise
 * escape the prefix, and only the extension carries any meaning here.
 */
export function avatarKey(userId: number, fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'png';
  return `${AVATAR_PREFIX}${userId}/${Date.now()}.${extension}`;
}

/**
 * Whether `key` is exactly what `avatarKey` would mint for `userId`.
 *
 * The stored value is presigned on read, so accepting an arbitrary key would
 * turn PATCH into a way to get a readable URL for someone else's object. Only a
 * key this service generated, for this user, is acceptable -- which also rules
 * out `..` segments and any other prefix.
 */
export function isAvatarKeyFor(key: string, userId: number): boolean {
  return new RegExp(`^${AVATAR_PREFIX}${userId}/\\d+\\.(${AVATAR_EXTENSIONS.join('|')})$`).test(key);
}

export async function presignAvatarUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 3600 },
  );
}

/**
 * Turns the stored `profile_image` into something an `<img>` can load.
 *
 * The bucket blocks all public access, so a stored key is useless to the
 * browser on its own -- every read has to be presigned. 15 minutes outlives a
 * page view without leaving a long-lived public handle on the object.
 *
 * Values that are already absolute URLs are passed through untouched, so rows
 * written before profile photos existed keep working. Signing failures return
 * the stored value rather than throwing: a missing avatar must not turn
 * `GET /users` into a 500, and the frontend already falls back to a placeholder
 * when the src does not load.
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
  } catch {
    return stored;
  }
}
