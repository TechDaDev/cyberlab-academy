/**
 * Explicitly Labeled Cloud Preview Demo Adapter (`preview-demo` mode ONLY).
 *
 * SECURITY & ARCHITECTURE NOTES:
 * - Never active by default in production (`live` mode uses `/api/v1` FastAPI backend).
 * - Activated ONLY when an operator explicitly enables "Cloud Preview Demo Mode" in environments
 *   where the developer's local FastAPI server (`127.0.0.1:8000`) is unreachable (Section 13).
 * - Stores state strictly in JavaScript runtime memory — NEVER persists tokens, passwords,
 *   secrets, or recovery codes in localStorage or sessionStorage.
 * - Faithfully mirrors the OpenAPI v0.2.0 state machine, role hierarchy, Manager boundaries,
 *   5-minute step-up window, MFA enrollment/recovery codes, and last-Administrator 409 guard.
 */

import { ApiError } from "@/lib/api/errors";
import type {
  AccountStatusRequest,
  AdminUserPublic,
  ChangeEmailRequest,
  ChangePasswordRequest,
  EmailRequest,
  InstructorDecision,
  InstructorRequestPublic,
  LoginRequest,
  Message,
  MFAConfirmRequest,
  MFAEnrollRequest,
  MFAEnrollResponse,
  MFARecoveryCodes,
  ProfileUpdate,
  ReauthenticateRequest,
  RegisterRequest,
  ResetPasswordRequest,
  Role,
  RoleChangeRequest,
  SessionPublic,
  SwitchRoleRequest,
  TokenRequest,
  UserPublic,
} from "@/lib/types/api";
import { evaluatePasswordPolicy } from "@/lib/utils";

interface DemoAccountRecord {
  id: string;
  full_name: string;
  email: string;
  password: string; // In-memory synthetic demo fixture ONLY
  roles: Role[];
  email_verified: boolean;
  is_active: boolean;
  created_at: string;
  mfa_enabled: boolean;
  mfa_pending_secret: string | null;
  recovery_codes: Set<string>;
}

interface DemoSessionRecord {
  id: string;
  user_id: string;
  active_role: Role;
  created_at: string;
  expires_at: string;
  authenticated_at: number;
  mfa_verified_at: number | null;
  revoked: boolean;
}

interface DemoOneTimeToken {
  token: string;
  user_id: string;
  kind: "verify_email" | "change_email" | "reset_password";
  target_email?: string;
  expires_at: number;
  consumed: boolean;
}

export const PREVIEW_DEMO_ACCOUNTS_HINT = [
  {
    label: "Student Cadet",
    email: "student.demo@cyberlab.academy",
    password: "Cadet-Orbit-9421!Secure",
    roles: ["student"] as Role[],
    mfaNote: "No MFA enrolled",
  },
  {
    label: "Lead Instructor",
    email: "instructor.demo@cyberlab.academy",
    password: "Mentor-Shield-8832!Safe",
    roles: ["student", "instructor"] as Role[],
    mfaNote: "No MFA required",
  },
  {
    label: "Operations Manager",
    email: "manager.demo@cyberlab.academy",
    password: "OpsGov-Vector-7741!Auth",
    roles: ["student", "instructor", "manager"] as Role[],
    mfaNote: "Step-up password within 5m",
  },
  {
    label: "Platform Administrator (MFA)",
    email: "admin.demo@cyberlab.academy",
    password: "RootSec-Aegis-6610!Core",
    roles: ["student", "instructor", "manager", "administrator"] as Role[],
    mfaNote: "Demo TOTP code: 246810",
  },
] as const;

export const PREVIEW_DEMO_TOTP_CODE = "246810";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

class InMemoryPreviewDemoStore {
  private users: Map<string, DemoAccountRecord> = new Map();
  private sessions: Map<string, DemoSessionRecord> = new Map();
  private currentSessionId: string | null = null;
  private applications: Map<string, InstructorRequestPublic> = new Map();
  private tokens: Map<string, DemoOneTimeToken> = new Map();
  private lastIssuedPreviewToken: string | null = null;
  private seq = 100;

  constructor() {
    this.reset();
  }

  public getLastIssuedPreviewToken(): string | null {
    return this.lastIssuedPreviewToken;
  }

  public reset(): void {
    this.users.clear();
    this.sessions.clear();
    this.applications.clear();
    this.tokens.clear();
    this.currentSessionId = null;
    this.lastIssuedPreviewToken = null;

    const seededUsers: DemoAccountRecord[] = [
      {
        id: "usr-demo-student-01",
        full_name: "Layla Al-Mansoor",
        email: "student.demo@cyberlab.academy",
        password: "Cadet-Orbit-9421!Secure",
        roles: ["student"],
        email_verified: true,
        is_active: true,
        created_at: "2026-09-12T08:30:00.000Z",
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      },
      {
        id: "usr-demo-applicant-02",
        full_name: "Tariq Haddad",
        email: "tariq.applicant@cyberlab.academy",
        password: "Applicant-Node-5521!Key",
        roles: ["student"],
        email_verified: true,
        is_active: true,
        created_at: "2026-10-18T11:15:00.000Z",
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      },
      {
        id: "usr-demo-unverified-03",
        full_name: "Nadia Kareem",
        email: "nadia.unverified@cyberlab.academy",
        password: "Pending-Mail-3319!Lock",
        roles: ["student"],
        email_verified: false,
        is_active: true,
        created_at: "2026-10-22T14:40:00.000Z",
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      },
      {
        id: "usr-demo-suspended-04",
        full_name: "Devon Mercer",
        email: "devon.suspended@cyberlab.academy",
        password: "Suspended-Lab-1190!Hold",
        roles: ["student"],
        email_verified: true,
        is_active: false,
        created_at: "2026-08-04T09:05:00.000Z",
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      },
      {
        id: "usr-demo-instructor-05",
        full_name: "Dr. Samira Nouri",
        email: "instructor.demo@cyberlab.academy",
        password: "Mentor-Shield-8832!Safe",
        roles: ["instructor", "student"],
        email_verified: true,
        is_active: true,
        created_at: "2026-07-19T07:20:00.000Z",
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      },
      {
        id: "usr-demo-manager-06",
        full_name: "Marcus Vance",
        email: "manager.demo@cyberlab.academy",
        password: "OpsGov-Vector-7741!Auth",
        roles: ["instructor", "manager", "student"],
        email_verified: true,
        is_active: true,
        created_at: "2026-06-10T10:00:00.000Z",
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      },
      {
        id: "usr-demo-admin-07",
        full_name: "Elena Rostova",
        email: "admin.demo@cyberlab.academy",
        password: "RootSec-Aegis-6610!Core",
        roles: ["administrator", "instructor", "manager", "student"],
        email_verified: true,
        is_active: true,
        created_at: "2026-05-01T06:00:00.000Z",
        mfa_enabled: true,
        mfa_pending_secret: null,
        recovery_codes: new Set(["DEMO-RCV-1001", "DEMO-RCV-1002"]),
      },
    ];

    for (const u of seededUsers) {
      this.users.set(u.id, u);
    }

    const seededApps: InstructorRequestPublic[] = [
      {
        id: "app-demo-101",
        user_id: "usr-demo-applicant-02",
        status: "pending",
        created_at: "2026-10-19T09:12:00.000Z",
        decided_at: null,
        decided_by: null,
        reason: "",
      },
      {
        id: "app-demo-102",
        user_id: "usr-demo-unverified-03",
        status: "pending",
        created_at: "2026-10-22T14:42:00.000Z",
        decided_at: null,
        decided_by: null,
        reason: "",
      },
      {
        id: "app-demo-103",
        user_id: "usr-demo-instructor-05",
        status: "approved",
        created_at: "2026-07-19T07:25:00.000Z",
        decided_at: "2026-07-20T11:00:00.000Z",
        decided_by: "usr-demo-manager-06",
        reason: "Verified academic credentials and SOC lab lead experience.",
      },
    ];

    for (const app of seededApps) {
      this.applications.set(app.id, app);
    }
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private toPublicUser(user: DemoAccountRecord, session: DemoSessionRecord): UserPublic {
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      roles: [...user.roles].sort(),
      active_role: session.active_role,
      email_verified: user.email_verified,
      created_at: user.created_at,
    };
  }

  private toAdminUser(user: DemoAccountRecord): AdminUserPublic {
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      roles: [...user.roles].sort(),
      email_verified: user.email_verified,
      created_at: user.created_at,
      is_active: user.is_active,
    };
  }

  private requireAuth(): { user: DemoAccountRecord; session: DemoSessionRecord } {
    if (!this.currentSessionId) {
      throw new ApiError({ status: 401, detail: "Authentication required" });
    }
    const session = this.sessions.get(this.currentSessionId);
    if (
      !session ||
      session.revoked ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      this.currentSessionId = null;
      throw new ApiError({ status: 401, detail: "Invalid or expired session" });
    }
    const user = this.users.get(session.user_id);
    if (!user || !user.is_active) {
      throw new ApiError({ status: 403, detail: "Account disabled" });
    }
    if (!user.roles.includes(session.active_role)) {
      session.revoked = true;
      this.currentSessionId = null;
      throw new ApiError({ status: 403, detail: "Active role revoked" });
    }
    if (session.active_role === "administrator") {
      if (!user.mfa_enabled || !session.mfa_verified_at) {
        throw new ApiError({ status: 403, detail: "Administrator MFA required" });
      }
    }
    return { user, session };
  }

  private authorizeAdmin(sensitive: boolean): {
    user: DemoAccountRecord;
    session: DemoSessionRecord;
  } {
    const ctx = this.requireAuth();
    if (
      ctx.session.active_role !== "manager" &&
      ctx.session.active_role !== "administrator"
    ) {
      throw new ApiError({ status: 403, detail: "Insufficient role" });
    }
    if (sensitive && Date.now() - ctx.session.authenticated_at > FIVE_MINUTES_MS) {
      throw new ApiError({ status: 403, detail: "Recent authentication required" });
    }
    if (sensitive && ctx.session.active_role === "administrator") {
      if (
        !ctx.session.mfa_verified_at ||
        Date.now() - ctx.session.mfa_verified_at > FIVE_MINUTES_MS
      ) {
        throw new ApiError({ status: 403, detail: "Recent MFA required" });
      }
    }
    return ctx;
  }

  private validateStrongPassword(
    password: string,
    email: string,
    fullName: string
  ): void {
    const check = evaluatePasswordPolicy({ password, email, fullName });
    if (!check.validLength) {
      throw new ApiError({
        status: 422,
        detail: "Password must be 12 to 128 characters",
        fieldErrors: { password: "Password must be 12 to 128 characters" },
      });
    }
    if (!check.notCommon) {
      throw new ApiError({
        status: 422,
        detail: "Password is too common",
        fieldErrors: { password: "Password is too common" },
      });
    }
    if (!check.excludesEmailLocal) {
      throw new ApiError({
        status: 422,
        detail: "Password must not contain email name",
        fieldErrors: { password: "Password must not contain email name" },
      });
    }
    if (!check.excludesFullName) {
      throw new ApiError({
        status: 422,
        detail: "Password must not contain full name",
        fieldErrors: { password: "Password must not contain full name" },
      });
    }
  }

  private findByEmail(email: string): DemoAccountRecord | undefined {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) return user;
    }
    return undefined;
  }

  private revokeAllSessions(userId: string, exceptSessionId?: string): void {
    for (const session of this.sessions.values()) {
      if (session.user_id === userId && session.id !== exceptSessionId) {
        session.revoked = true;
        if (this.currentSessionId === session.id) {
          this.currentSessionId = null;
        }
      }
    }
  }

  private issueDemoToken(
    userId: string,
    kind: DemoOneTimeToken["kind"],
    minutes: number,
    targetEmail?: string
  ): string {
    for (const existing of this.tokens.values()) {
      if (existing.user_id === userId && existing.kind === kind && !existing.consumed) {
        existing.consumed = true;
      }
    }
    const token = `demo_tok_${Math.random().toString(36).slice(2, 14)}_${Date.now().toString(36)}_preview`;
    this.tokens.set(token, {
      token,
      user_id: userId,
      kind,
      target_email: targetEmail,
      expires_at: Date.now() + minutes * 60 * 1000,
      consumed: false,
    });
    this.lastIssuedPreviewToken = token;
    return token;
  }

  public register(payload: RegisterRequest): Message {
    const fullName = payload.full_name.trim();
    if (fullName.length < 2 || fullName.length > 160) {
      throw new ApiError({
        status: 422,
        detail: "Full name must contain at least 2 characters",
        fieldErrors: { full_name: "Full name must contain at least 2 characters" },
      });
    }
    if (payload.password !== payload.password_confirmation) {
      throw new ApiError({
        status: 422,
        detail: "Passwords do not match",
        fieldErrors: { password_confirmation: "Passwords do not match" },
      });
    }
    const email = payload.email.trim().toLowerCase();
    this.validateStrongPassword(payload.password, email, fullName);

    if (!this.findByEmail(email)) {
      const id = this.nextId("usr-demo");
      const record: DemoAccountRecord = {
        id,
        full_name: fullName,
        email,
        password: payload.password,
        roles: ["student"],
        email_verified: false,
        is_active: true,
        created_at: new Date().toISOString(),
        mfa_enabled: false,
        mfa_pending_secret: null,
        recovery_codes: new Set(),
      };
      this.users.set(id, record);
      if (payload.instructor_application) {
        const appId = this.nextId("app-demo");
        this.applications.set(appId, {
          id: appId,
          user_id: id,
          status: "pending",
          created_at: new Date().toISOString(),
          decided_at: null,
          decided_by: null,
          reason: "",
        });
      }
      this.issueDemoToken(id, "verify_email", 60);
    }

    return { message: "If eligible, check your email for verification" };
  }

  public resendVerification(payload: EmailRequest): Message {
    const user = this.findByEmail(payload.email);
    if (user && !user.email_verified) {
      this.issueDemoToken(user.id, "verify_email", 60);
    }
    return { message: "If eligible, a verification email has been sent" };
  }

  public verifyEmail(payload: TokenRequest): Message {
    const rec = this.tokens.get(payload.token);
    if (
      !rec ||
      rec.consumed ||
      rec.expires_at <= Date.now() ||
      (rec.kind !== "verify_email" && rec.kind !== "change_email")
    ) {
      throw new ApiError({ status: 400, detail: "Invalid or expired token" });
    }
    const user = this.users.get(rec.user_id);
    if (!user) {
      throw new ApiError({ status: 400, detail: "Invalid or expired token" });
    }
    rec.consumed = true;
    if (rec.kind === "change_email" && rec.target_email) {
      const conflict = this.findByEmail(rec.target_email);
      if (conflict && conflict.id !== user.id) {
        throw new ApiError({ status: 409, detail: "Email unavailable" });
      }
      user.email = rec.target_email;
      this.revokeAllSessions(user.id);
    }
    user.email_verified = true;
    return { message: "Email verified" };
  }

  public login(payload: LoginRequest): UserPublic {
    const user = this.findByEmail(payload.email);
    if (
      !user ||
      user.password !== payload.password ||
      !user.is_active ||
      user.roles.length === 0
    ) {
      throw new ApiError({ status: 401, detail: "Invalid credentials" });
    }
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + TWELVE_HOURS_MS).toISOString();
    const session: DemoSessionRecord = {
      id: this.nextId("sess-demo"),
      user_id: user.id,
      active_role: user.roles.includes("student")
        ? "student"
        : [...user.roles].sort()[0],
      created_at: nowIso,
      expires_at: expiresIso,
      authenticated_at: Date.now(),
      mfa_verified_at: null,
      revoked: false,
    };
    this.sessions.set(session.id, session);

    // Create one realistic secondary session on first demo sign-in so session revocation UI is testable
    const existingOther = Array.from(this.sessions.values()).filter(
      (s) => s.user_id === user.id && !s.revoked && s.id !== session.id
    );
    if (existingOther.length === 0) {
      const sibling: DemoSessionRecord = {
        id: this.nextId("sess-demo-prev"),
        user_id: user.id,
        active_role: "student",
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
        authenticated_at: Date.now() - 2 * 3600 * 1000,
        mfa_verified_at: null,
        revoked: false,
      };
      this.sessions.set(sibling.id, sibling);
    }

    this.currentSessionId = session.id;
    return this.toPublicUser(user, session);
  }

  public logout(): void {
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) session.revoked = true;
      this.currentSessionId = null;
    }
  }

  public logoutAll(): void {
    const { user } = this.requireAuth();
    this.revokeAllSessions(user.id);
    this.currentSessionId = null;
  }

  public me(): UserPublic {
    const { user, session } = this.requireAuth();
    return this.toPublicUser(user, session);
  }

  public updateProfile(payload: ProfileUpdate): UserPublic {
    const { user, session } = this.requireAuth();
    const trimmed = payload.full_name.trim();
    if (trimmed.length < 2 || trimmed.length > 160) {
      throw new ApiError({
        status: 422,
        detail: "Full name must contain at least 2 characters",
        fieldErrors: { full_name: "Full name must contain at least 2 characters" },
      });
    }
    user.full_name = trimmed;
    return this.toPublicUser(user, session);
  }

  public listRoles(): Role[] {
    const { user } = this.requireAuth();
    return [...user.roles].sort();
  }

  public switchRole(payload: SwitchRoleRequest): UserPublic {
    const { user, session } = this.requireAuth();
    if (!user.roles.includes(payload.role)) {
      throw new ApiError({ status: 403, detail: "Role not assigned" });
    }
    if (payload.role === "manager" || payload.role === "administrator") {
      if (Date.now() - session.authenticated_at > FIVE_MINUTES_MS) {
        throw new ApiError({ status: 403, detail: "Recent authentication required" });
      }
    }
    if (payload.role === "administrator") {
      if (
        !user.mfa_enabled ||
        !session.mfa_verified_at ||
        Date.now() - session.mfa_verified_at > FIVE_MINUTES_MS
      ) {
        throw new ApiError({ status: 403, detail: "Recent MFA required" });
      }
    }
    session.active_role = payload.role;
    return this.toPublicUser(user, session);
  }

  public reauthenticate(payload: ReauthenticateRequest): UserPublic {
    const { user, session } = this.requireAuth();
    if (user.password !== payload.password) {
      throw new ApiError({ status: 401, detail: "Invalid credentials" });
    }
    if (payload.mfa_code) {
      const code = payload.mfa_code.trim();
      const validTotp = user.mfa_enabled && code === PREVIEW_DEMO_TOTP_CODE;
      const validRecovery = user.mfa_enabled && user.recovery_codes.has(code);
      if (!validTotp && !validRecovery) {
        throw new ApiError({ status: 401, detail: "Invalid MFA code" });
      }
      if (validRecovery) {
        user.recovery_codes.delete(code);
      }
      session.mfa_verified_at = Date.now();
    } else {
      session.mfa_verified_at = null;
      if (session.active_role === "administrator") {
        session.active_role = "student";
      }
    }
    session.authenticated_at = Date.now();
    return this.toPublicUser(user, session);
  }

  public listSessions(): SessionPublic[] {
    const { user, session: current } = this.requireAuth();
    return Array.from(this.sessions.values())
      .filter(
        (s) =>
          s.user_id === user.id &&
          !s.revoked &&
          new Date(s.expires_at).getTime() > Date.now()
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => ({
        id: s.id,
        active_role: s.active_role,
        created_at: s.created_at,
        expires_at: s.expires_at,
        current: s.id === current.id,
        mfa_verified: s.mfa_verified_at !== null,
      }));
  }

  public revokeSession(sessionId: string): void {
    const { user, session: current } = this.requireAuth();
    const record = this.sessions.get(sessionId);
    if (!record || record.user_id !== user.id) {
      throw new ApiError({ status: 404, detail: "Session not found" });
    }
    record.revoked = true;
    if (record.id === current.id) {
      this.currentSessionId = null;
    }
  }

  public changePassword(payload: ChangePasswordRequest): void {
    const { user } = this.requireAuth();
    if (user.password !== payload.current_password) {
      throw new ApiError({ status: 401, detail: "Invalid credentials" });
    }
    if (payload.new_password !== payload.new_password_confirmation) {
      throw new ApiError({
        status: 422,
        detail: "Passwords do not match",
        fieldErrors: { new_password_confirmation: "Passwords do not match" },
      });
    }
    this.validateStrongPassword(payload.new_password, user.email, user.full_name);
    user.password = payload.new_password;
    this.revokeAllSessions(user.id);
    this.currentSessionId = null;
  }

  public changeEmail(payload: ChangeEmailRequest): Message {
    const { user } = this.requireAuth();
    if (user.password !== payload.password) {
      throw new ApiError({ status: 401, detail: "Invalid credentials" });
    }
    const normalized = payload.new_email.trim().toLowerCase();
    if (!this.findByEmail(normalized)) {
      this.issueDemoToken(user.id, "change_email", 60, normalized);
    }
    return { message: "If eligible, check the new email address" };
  }

  public forgotPassword(payload: EmailRequest): Message {
    const user = this.findByEmail(payload.email);
    if (user && user.is_active) {
      this.issueDemoToken(user.id, "reset_password", 30);
    }
    return { message: "If the account exists, a reset email has been sent" };
  }

  public resetPassword(payload: ResetPasswordRequest): Message {
    if (payload.password !== payload.password_confirmation) {
      throw new ApiError({
        status: 422,
        detail: "Passwords do not match",
        fieldErrors: { password_confirmation: "Passwords do not match" },
      });
    }
    const rec = this.tokens.get(payload.token);
    if (!rec || rec.consumed || rec.expires_at <= Date.now() || rec.kind !== "reset_password") {
      throw new ApiError({ status: 400, detail: "Invalid or expired token" });
    }
    const user = this.users.get(rec.user_id);
    if (!user || !user.is_active) {
      throw new ApiError({ status: 400, detail: "Invalid or expired token" });
    }
    this.validateStrongPassword(payload.password, user.email, user.full_name);
    rec.consumed = true;
    user.password = payload.password;
    this.revokeAllSessions(user.id);
    return { message: "Password reset complete. Sign in again" };
  }

  public enrollMfa(payload: MFAEnrollRequest): MFAEnrollResponse {
    const { user, session } = this.requireAuth();
    if (Date.now() - session.authenticated_at > FIVE_MINUTES_MS) {
      throw new ApiError({ status: 403, detail: "Recent authentication required" });
    }
    if (user.password !== payload.password) {
      throw new ApiError({ status: 401, detail: "Invalid credentials" });
    }
    if (user.mfa_enabled) {
      throw new ApiError({ status: 409, detail: "MFA already enabled" });
    }
    const demoSecret = "JBSWY3DPEHPK3PXP2468DEMO";
    user.mfa_pending_secret = demoSecret;
    const issuer = encodeURIComponent("CyberLab Academy");
    const label = encodeURIComponent(user.email);
    return {
      secret: demoSecret,
      otpauth_uri: `otpauth://totp/${issuer}:${label}?secret=${demoSecret}&issuer=${issuer}`,
    };
  }

  public confirmMfa(payload: MFAConfirmRequest): MFARecoveryCodes {
    const { user, session } = this.requireAuth();
    if (
      !user.mfa_pending_secret ||
      user.mfa_enabled ||
      payload.code.trim().length !== 6 ||
      !/^\d{6}$/.test(payload.code.trim())
    ) {
      throw new ApiError({ status: 400, detail: "Invalid MFA enrollment code" });
    }
    // In Cloud Preview Demo Mode, accept the documented demo code 246810
    if (payload.code.trim() !== PREVIEW_DEMO_TOTP_CODE) {
      throw new ApiError({
        status: 400,
        detail: `Invalid MFA enrollment code (in Cloud Preview Demo Mode use ${PREVIEW_DEMO_TOTP_CODE})`,
      });
    }
    user.mfa_enabled = true;
    user.mfa_pending_secret = null;
    const codes = Array.from({ length: 8 }, (_, idx) => {
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      return `CLAB-DEMO-${idx + 1}-${rand}`;
    });
    user.recovery_codes = new Set(codes);
    session.mfa_verified_at = Date.now();
    session.authenticated_at = Date.now();
    this.revokeAllSessions(user.id, session.id);
    return { recovery_codes: codes };
  }

  public listAdminUsers(params?: {
    search?: string;
    role?: Role | "";
    active?: boolean | null;
  }): AdminUserPublic[] {
    const { session } = this.authorizeAdmin(false);
    let list = Array.from(this.users.values());

    if (session.active_role === "manager") {
      list = list.filter(
        (u) => !u.roles.includes("manager") && !u.roles.includes("administrator")
      );
    }
    if (params?.search) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.full_name.toLowerCase().includes(q)
      );
    }
    if (params?.role) {
      list = list.filter((u) => u.roles.includes(params.role as Role));
    }
    if (params?.active !== undefined && params.active !== null) {
      list = list.filter((u) => u.is_active === params.active);
    }

    return list
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100)
      .map((u) => this.toAdminUser(u));
  }

  private checkTargetAccess(
    actorRole: Role,
    target: DemoAccountRecord,
    targetRole?: Role
  ): void {
    if (actorRole === "manager") {
      if (
        targetRole === "manager" ||
        targetRole === "administrator" ||
        target.roles.includes("manager") ||
        target.roles.includes("administrator")
      ) {
        throw new ApiError({
          status: 403,
          detail: "Managers cannot change privileged accounts or roles",
        });
      }
    }
  }

  private protectLastAdmin(target: DemoAccountRecord): void {
    if (!target.roles.includes("administrator") || !target.is_active) return;
    const activeAdmins = Array.from(this.users.values()).filter(
      (u) => u.is_active && u.roles.includes("administrator")
    );
    if (activeAdmins.length <= 1) {
      throw new ApiError({
        status: 409,
        detail: "Cannot remove last active administrator",
      });
    }
  }

  public suspendUser(userId: string, payload: AccountStatusRequest): AdminUserPublic {
    const { session } = this.authorizeAdmin(true);
    if (payload.reason.trim().length < 3) {
      throw new ApiError({
        status: 422,
        detail: "Reason must contain at least 3 characters",
      });
    }
    const target = this.users.get(userId);
    if (!target) throw new ApiError({ status: 404, detail: "User not found" });
    this.checkTargetAccess(session.active_role, target);
    this.protectLastAdmin(target);
    target.is_active = false;
    this.revokeAllSessions(target.id);
    return this.toAdminUser(target);
  }

  public reactivateUser(
    userId: string,
    payload: AccountStatusRequest
  ): AdminUserPublic {
    const { session } = this.authorizeAdmin(true);
    if (payload.reason.trim().length < 3) {
      throw new ApiError({
        status: 422,
        detail: "Reason must contain at least 3 characters",
      });
    }
    const target = this.users.get(userId);
    if (!target) throw new ApiError({ status: 404, detail: "User not found" });
    this.checkTargetAccess(session.active_role, target);
    target.is_active = true;
    return this.toAdminUser(target);
  }

  public grantRole(userId: string, payload: RoleChangeRequest): AdminUserPublic {
    const { session } = this.authorizeAdmin(true);
    if (payload.reason.trim().length < 3) {
      throw new ApiError({
        status: 422,
        detail: "Reason must contain at least 3 characters",
      });
    }
    const target = this.users.get(userId);
    if (!target) throw new ApiError({ status: 404, detail: "User not found" });
    this.checkTargetAccess(session.active_role, target, payload.role);
    if (
      (payload.role === "instructor" ||
        payload.role === "manager" ||
        payload.role === "administrator") &&
      !target.email_verified
    ) {
      throw new ApiError({
        status: 409,
        detail: "Verified email required for privileged role",
      });
    }
    if (target.roles.includes(payload.role)) {
      throw new ApiError({ status: 409, detail: "Role already assigned" });
    }
    target.roles.push(payload.role);
    this.revokeAllSessions(target.id);
    return this.toAdminUser(target);
  }

  public revokeRole(
    userId: string,
    role: Role,
    payload: AccountStatusRequest
  ): AdminUserPublic {
    const { session } = this.authorizeAdmin(true);
    if (payload.reason.trim().length < 3) {
      throw new ApiError({
        status: 422,
        detail: "Reason must contain at least 3 characters",
      });
    }
    const target = this.users.get(userId);
    if (!target) throw new ApiError({ status: 404, detail: "User not found" });
    this.checkTargetAccess(session.active_role, target, role);
    if (!target.roles.includes(role)) {
      throw new ApiError({ status: 404, detail: "Role not assigned" });
    }
    if (role === "administrator") {
      this.protectLastAdmin(target);
    }
    if (role === "student" && target.roles.includes("administrator")) {
      throw new ApiError({
        status: 409,
        detail: "Administrator must retain Student fallback role",
      });
    }
    if (target.roles.length === 1) {
      throw new ApiError({
        status: 409,
        detail: "Account must retain a role",
      });
    }
    target.roles = target.roles.filter((r) => r !== role);
    this.revokeAllSessions(target.id);
    return this.toAdminUser(target);
  }

  public listInstructorApplications(status?: string): InstructorRequestPublic[] {
    this.authorizeAdmin(false);
    let items = Array.from(this.applications.values());
    if (status) {
      if (!["pending", "approved", "rejected"].includes(status)) {
        throw new ApiError({ status: 422, detail: "Invalid status" });
      }
      items = items.filter((item) => item.status === status);
    }
    return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public decideInstructorApplication(
    applicationId: string,
    decision: "approved" | "rejected",
    payload: InstructorDecision
  ): InstructorRequestPublic {
    const { user, session } = this.authorizeAdmin(true);
    if (payload.reason.trim().length < 3) {
      throw new ApiError({
        status: 422,
        detail: "Reason must contain at least 3 characters",
      });
    }
    const app = this.applications.get(applicationId);
    if (!app) {
      throw new ApiError({ status: 404, detail: "Application not found" });
    }
    if (app.status !== "pending") {
      throw new ApiError({ status: 409, detail: "Application already decided" });
    }
    if (app.user_id === user.id) {
      throw new ApiError({
        status: 403,
        detail: "Cannot decide own application",
      });
    }
    const target = this.users.get(app.user_id);
    if (!target) {
      throw new ApiError({ status: 404, detail: "User not found" });
    }
    this.checkTargetAccess(session.active_role, target);
    if (!target.is_active) {
      throw new ApiError({
        status: 409,
        detail: "Applicant account is inactive",
      });
    }
    if (!target.email_verified) {
      throw new ApiError({
        status: 409,
        detail: "Applicant email is not verified",
      });
    }
    if (decision === "approved" && !target.roles.includes("instructor")) {
      target.roles.push("instructor");
      this.revokeAllSessions(target.id);
    }
    const updated: InstructorRequestPublic = {
      ...app,
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      reason: payload.reason.trim(),
    };
    this.applications.set(applicationId, updated);
    return updated;
  }
}

export const previewDemoStore = new InMemoryPreviewDemoStore();
