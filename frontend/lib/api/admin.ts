import { apiRequest, getApiConnectionMode } from "@/lib/api/client";
import { previewDemoStore } from "@/lib/api/preview-demo-adapter";
import type {
  AccountStatusRequest,
  AdminUserPublic,
  InstructorDecision,
  InstructorRequestPublic,
  Role,
  RoleChangeRequest,
} from "@/lib/types/api";

export interface ListUsersFilters {
  search?: string;
  role?: Role | "";
  active?: boolean | null;
}

export const adminApi = {
  async listUsers(filters: ListUsersFilters = {}): Promise<AdminUserPublic[]> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.listAdminUsers(filters);
    }
    return apiRequest<AdminUserPublic[]>("/admin/users", {
      method: "GET",
      query: {
        search: filters.search?.trim() || undefined,
        role: filters.role || undefined,
        active:
          filters.active === null || filters.active === undefined
            ? undefined
            : filters.active,
      },
    });
  },

  async suspendUser(
    userId: string,
    payload: AccountStatusRequest
  ): Promise<AdminUserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.suspendUser(userId, payload);
    }
    return apiRequest<AdminUserPublic>(
      `/admin/users/${encodeURIComponent(userId)}/suspend`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async reactivateUser(
    userId: string,
    payload: AccountStatusRequest
  ): Promise<AdminUserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.reactivateUser(userId, payload);
    }
    return apiRequest<AdminUserPublic>(
      `/admin/users/${encodeURIComponent(userId)}/reactivate`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async grantRole(
    userId: string,
    payload: RoleChangeRequest
  ): Promise<AdminUserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.grantRole(userId, payload);
    }
    return apiRequest<AdminUserPublic>(
      `/admin/users/${encodeURIComponent(userId)}/roles`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async revokeRole(
    userId: string,
    role: Role,
    payload: AccountStatusRequest
  ): Promise<AdminUserPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.revokeRole(userId, role, payload);
    }
    return apiRequest<AdminUserPublic>(
      `/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
      {
        method: "DELETE",
        body: payload,
      }
    );
  },

  async listInstructorApplications(
    status?: "pending" | "approved" | "rejected" | ""
  ): Promise<InstructorRequestPublic[]> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.listInstructorApplications(status || undefined);
    }
    return apiRequest<InstructorRequestPublic[]>("/admin/instructor-applications", {
      method: "GET",
      query: {
        status: status || undefined,
      },
    });
  },

  async approveInstructorApplication(
    applicationId: string,
    payload: InstructorDecision
  ): Promise<InstructorRequestPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.decideInstructorApplication(
        applicationId,
        "approved",
        payload
      );
    }
    return apiRequest<InstructorRequestPublic>(
      `/admin/instructor-applications/${encodeURIComponent(applicationId)}/approve`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async rejectInstructorApplication(
    applicationId: string,
    payload: InstructorDecision
  ): Promise<InstructorRequestPublic> {
    if (getApiConnectionMode() === "preview-demo") {
      return previewDemoStore.decideInstructorApplication(
        applicationId,
        "rejected",
        payload
      );
    }
    return apiRequest<InstructorRequestPublic>(
      `/admin/instructor-applications/${encodeURIComponent(applicationId)}/reject`,
      {
        method: "POST",
        body: payload,
      }
    );
  },
};
