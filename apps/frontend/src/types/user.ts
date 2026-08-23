export interface User {
    user_id: number;
    name: string;
    email: string;
    is_admin: boolean;
    created_at?: string;
    profile_image?: string | null;
}

/**
 * Body of `GET /users/{userId}` and `PATCH /users/{userId}`.
 *
 * Not the same shape as `User`: those endpoints project the row into camelCase
 * for the identity fields while leaving `profile_image` and `created_at` as
 * they are in the database, whereas `GET /users` returns raw rows.
 */
export interface UserDetail {
    userId: number;
    name: string;
    email: string;
    isAdmin: boolean;
    /** Presigned by the API — the bucket is private, so it expires. */
    profile_image?: string | null;
    created_at?: string | null;
}
