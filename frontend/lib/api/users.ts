import { apiRequest, getApiConnectionMode } from "@/lib/api/client";
import { previewDemoStore } from "@/lib/api/preview-demo-adapter";
import type {
  ChangeEmailRequest,
  ChangePasswordRequest,
  Message,
  ProfileUpdate,
  Role,
  SessionPublic,
  UserPublic,
} from "@/lib/types/api";

export const usersApi = {
  async getMe(options?: { emitSessionExpiredOn401?: boolean }): Promise<UserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.me();
    }
    return apiRequest<UserPublic>("/users/me", {
      method: "GET",
      emitSessionExpiredOn401: options?.emitSessionExpiredOn401 ?? true,
    });
  },

  async updateProfile(payload: ProfileUpdate): Promise<UserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.updateProfile(payload);
    }
    return apiRequest<UserPublic>("/users/me", {
      method: "PATCH",
      body: payload,
    });
  },

  async getAssignedRoles(): Promise<Role[]> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.listRoles();
    }
    return apiRequest<Role[]>("/users/me/roles", {
      method: "GET",
    });
  },

  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    if (getApiConnectionMode() === "preview-demo") {
      previewDemoStore.changePassword(payload);
      return;
    }
    // 401 on /users/me/password indicates invalid current_password
    return apiRequest<void>("/users/me/password", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async changeEmail(payload: ChangeEmailRequest): Promise<Message> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.changeEmail(payload);
    }
    return apiRequest<Message>("/users/me/email", {
      method: "POST",
      body: payload,
      emitSessionExpiredOn401: false,
    });
  },

  async listSessions(): Promise<SessionPublic[]> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.listSessions();
    }
    return apiRequest<SessionPublic[]>("/users/me/sessions", {
      method: "GET",
    });
  },

  async revokeSession(sessionId: string): Promise<void> {
    if (getApiConnectionMode() === "preview-demo") {
      previewDemoStore.revokeSession(sessionId);
      return;
    }
    return apiRequest<void>(`/users/me/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  },
};
