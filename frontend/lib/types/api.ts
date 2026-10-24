/**
 * Authoritative TypeScript types derived directly from `shared-contracts/openapi.json` (v0.2.0).
 * Do not add uncontracted backend fields here.
 */

export type Role = "student" | "instructor" | "manager" | "administrator";

export const ALL_ROLES: readonly Role[] = [
  "student",
  "instructor",
  "manager",
  "administrator",
] as const;

export const MANAGER_GOVERNABLE_ROLES: readonly Role[] = [
  "student",
  "instructor",
] as const;

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
  password_confirmation: string;
  instructor_application?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface EmailRequest {
  email: string;
}

export interface TokenRequest {
  token: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  password_confirmation: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}

export interface ChangeEmailRequest {
  new_email: string;
  password: string;
}

export interface ReauthenticateRequest {
  password: string;
  mfa_code?: string | null;
}

export interface MFAEnrollRequest {
  password: string;
}

export interface MFAConfirmRequest {
  code: string;
}

export interface MFAEnrollResponse {
  secret: string;
  otpauth_uri: string;
}

export interface MFARecoveryCodes {
  recovery_codes: string[];
}

export interface SwitchRoleRequest {
  role: Role;
}

export interface ProfileUpdate {
  full_name: string;
}

export interface UserPublic {
  id: string;
  full_name: string;
  email: string;
  roles: Role[];
  active_role: Role;
  email_verified: boolean;
  created_at: string;
}

export interface AdminUserPublic {
  id: string;
  full_name: string;
  email: string;
  roles: Role[];
  email_verified: boolean;
  created_at: string;
  is_active: boolean;
}

export interface SessionPublic {
  id: string;
  active_role: Role;
  created_at: string;
  expires_at: string;
  current: boolean;
  mfa_verified: boolean;
}

export type InstructorApplicationStatus = "pending" | "approved" | "rejected";

export interface InstructorRequestPublic {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  reason: string;
}

export interface InstructorDecision {
  reason: string;
}

export interface RoleChangeRequest {
  role: Role;
  reason: string;
}

export interface AccountStatusRequest {
  reason: string;
}

export interface Message {
  message: string;
}

export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
  ctx?: Record<string, unknown>;
}

export interface HTTPValidationError {
  detail: ValidationErrorItem[];
}

export type ApiConnectionMode = "live" | "preview-demo";

export type StepUpReason =
  | "recent_auth"
  | "recent_mfa"
  | "admin_mfa"
  | "manager_mfa";
