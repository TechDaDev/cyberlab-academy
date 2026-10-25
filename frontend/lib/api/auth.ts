import { apiRequest, getApiConnectionMode } from "@/lib/api/client";
import { previewDemoStore } from "@/lib/api/preview-demo-adapter";
import type {
  EmailRequest,
  LoginRequest,
  Message,
  MFAConfirmRequest,
  MFAEnrollRequest,
  MFAEnrollResponse,
  MFARecoveryCodes,
  ReauthenticateRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SwitchRoleRequest,
  TokenRequest,
  UserPublic,
} from "@/lib/types/api";

export const authApi = {
  async checkHealth(): Promise<{ status: string }> {
    return apiRequest<{ status: string }>("/health", {
      method: "GET",
      emitSessionExpiredOn401: false,
    });
  },

  async register(payload: RegisterRequest): Promise<Message> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.register(payload);
    }
    return apiRequest<Message>("/auth/register", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async resendVerification(payload: EmailRequest): Promise<Message> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.resendVerification(payload);
    }
    return apiRequest<Message>("/auth/verification/resend", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async verifyEmail(payload: TokenRequest): Promise<Message> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.verifyEmail(payload);
    }
    return apiRequest<Message>("/auth/verify-email", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async login(payload: LoginRequest): Promise<UserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.login(payload);
    }
    return apiRequest<UserPublic>("/auth/login", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async forgotPassword(payload: EmailRequest): Promise<Message> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.forgotPassword(payload);
    }
    return apiRequest<Message>("/auth/forgot-password", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<Message> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.resetPassword(payload);
    }
    return apiRequest<Message>("/auth/reset-password", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async logout(): Promise<void> {
    if (getApiConnectionMode() === "preview-demo") {
      previewDemoStore.logout();
      return;
    }
    return apiRequest<void>("/auth/logout", {
      method: "POST",
      emitSessionExpiredOn401: false,
    });
  },

  async logoutAll(): Promise<void> {
    if (getApiConnectionMode() === "preview-demo") {
      previewDemoStore.logoutAll();
      return;
    }
    return apiRequest<void>("/auth/logout-all", {
      method: "POST",
    });
  },

  async switchActiveRole(payload: SwitchRoleRequest): Promise<UserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.switchRole(payload);
    }
    return apiRequest<UserPublic>("/auth/active-role", {
      method: "POST",
      body: payload,
    });
  },

  async reauthenticate(payload: ReauthenticateRequest): Promise<UserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.reauthenticate(payload);
    }
    // 401 on /auth/reauthenticate means wrong password or invalid MFA code, not revoked cookie
    return apiRequest<UserPublic>("/auth/reauthenticate", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async enrollMfa(payload: MFAEnrollRequest): Promise<MFAEnrollResponse> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.enrollMfa(payload);
    }
    // 401 on /auth/mfa/enroll means invalid password (when session is valid)
    return apiRequest<MFAEnrollResponse>("/auth/mfa/enroll", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async confirmMfa(payload: MFAConfirmRequest): Promise<MFARecoveryCodes> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.confirmMfa(payload);
    }
    return apiRequest<MFARecoveryCodes>("/auth/mfa/confirm", {
      method: "POST",
      body: payload,
    });
  },
};
