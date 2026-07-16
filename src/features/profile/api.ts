/** profile：资料 API */
import { apiRequest, apiUpload } from "@/shared/api/http-client";
import type { Profile } from "./types";
export const getProfile = () => apiRequest<Profile>("GET", "/api/profile");
export const updateProfile = (displayName: string) => apiRequest<{ message: string }>("PUT", "/api/profile", { displayName });
export const uploadAvatar = (blob: Blob) => { const form = new FormData(); form.append("file", blob, "avatar.webp"); return apiUpload<{ avatarUrl: string }>("/api/profile/avatar", form); };
export const removeAvatar = () => apiRequest<{ message: string }>("DELETE", "/api/profile/avatar");
