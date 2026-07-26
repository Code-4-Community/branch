export interface User {
    user_id: number;
    name: string;
    email: string;
    is_admin: boolean;
    created_at?: string;
    profile_image?: string | null;
}