"use client";

import * as React from "react";
import { authApi } from "@/lib/api/auth";
import {
  getApiConnectionMode,
  isPreviewDemoFeatureAllowed,
  onUnauthorizedSession,
  setApiConnectionMode,
} from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";
import type {
  ApiConnectionMode,
  LoginRequest,
  Role,
  StepUpReason,
  UserPublic,
} from "@/lib/types/api";
import { useToast } from "@/hooks/use-toast";

export type BackendHealthState = "checking" | "online" | "unreachable";

export interface StepUpPromptState {
  open: boolean;
  reason: StepUpReason;
  targetRole?: Role;
  contextDescription?: string;
  onSuccessCallback?: () => Promise<void> | void;
}

export interface AuthContextValue {
  user: UserPublic | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  apiMode: ApiConnectionMode;
  backendHealth: BackendHealthState;
  sessionExpiredMessage: string | null;
  clearSessionExpiredMessage: () => void;
  setMode: (mode: ApiConnectionMode) => Promise<void>;
  recheckBackendHealth: () => Promise<BackendHealthState>;
  refreshUser: () => Promise<UserPublic | null>;
  login: (payload: LoginRequest) => Promise<UserPublic>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  clearLocalSession: (reasonMessage?: string) => void;
  switchRole: (role: Role) => Promise<UserPublic | null>;
  stepUpState: StepUpPromptState | null;
  requestStepUp: (params: {
    reason: StepUpReason;
    targetRole?: Role;
    contextDescription?: string;
    onSuccess?: () => Promise<void> | void;
  }) => void;
  closeStepUp: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [user, setUser] = React.useState<UserPublic | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [apiModeState, setApiModeState] = React.useState<ApiConnectionMode>(() =>
    getApiConnectionMode()
  );
  const [backendHealth, setBackendHealth] =
    React.useState<BackendHealthState>("checking");
  const [sessionExpiredMessage, setSessionExpiredMessage] = React.useState<
    string | null
  >(null);
  const [stepUpState, setStepUpState] =
    React.useState<StepUpPromptState | null>(null);

  const recheckBackendHealth = React.useCallback(async (): Promise<BackendHealthState> => {
    try {
      const res = await authApi.checkHealth();
      if (res?.status === "ok") {
        setBackendHealth("online");
        return "online";
      }
      setBackendHealth("unreachable");
      return "unreachable";
    } catch {
      setBackendHealth("unreachable");
      return "unreachable";
    }
  }, []);

  const refreshUser = React.useCallback(async (): Promise<UserPublic | null> => {
    try {
      const me = await usersApi.getMe({ emitSessionExpiredOn401: false });
      setUser(me);
      return me;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null);
      } else if (err instanceof ApiError && err.isBackendUnreachable) {
        setUser(null);
        setBackendHealth("unreachable");
      }
      return null;
    }
  }, []);

  // Initial session & backend health bootstrap
  React.useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      const health = await recheckBackendHealth();
      if (!active) return;
      if (health === "online" || getApiConnectionMode() === "preview-demo") {
        await refreshUser();
      } else {
        setUser(null);
      }
      if (active) {
        setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [recheckBackendHealth, refreshUser]);

  // Global 401 session expiration / revocation listener
  React.useEffect(() => {
    return onUnauthorizedSession(() => {
      setUser((prev) => {
        if (prev !== null) {
          setSessionExpiredMessage(
            "Your session expired or was revoked. Please sign in again to continue."
          );
          toast({
            title: "Session ended",
            description: "Your session expired or was revoked on the server.",
            variant: "warning",
          });
        }
        return null;
      });
    });
  }, [toast]);

  const setMode = React.useCallback(
    async (nextMode: ApiConnectionMode) => {
      if (nextMode === "preview-demo" && !isPreviewDemoFeatureAllowed()) {
        return;
      }
      setApiConnectionMode(nextMode);
      setApiModeState(nextMode);
      setStepUpState(null);
      setSessionExpiredMessage(null);
      setIsLoading(true);
      if (nextMode === "live") {
        await recheckBackendHealth();
      }
      await refreshUser();
      setIsLoading(false);
    },
    [recheckBackendHealth, refreshUser]
  );

  const login = React.useCallback(
    async (payload: LoginRequest): Promise<UserPublic> => {
      setSessionExpiredMessage(null);
      const loggedIn = await authApi.login(payload);
      // Section 12: After login or role switching, refresh `/users/me`
      const authoritative = await usersApi.getMe({
        emitSessionExpiredOn401: false,
      });
      const resolved = authoritative ?? loggedIn;
      setUser(resolved);
      return resolved;
    },
    []
  );

  const logout = React.useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Clear local session state regardless of network status
    } finally {
      setUser(null);
      setStepUpState(null);
    }
  }, []);

  const logoutAll = React.useCallback(async () => {
    await authApi.logoutAll();
    setUser(null);
    setStepUpState(null);
  }, []);

  const clearLocalSession = React.useCallback((reasonMessage?: string) => {
    setUser(null);
    setStepUpState(null);
    if (reasonMessage) {
      setSessionExpiredMessage(reasonMessage);
    }
  }, []);

  const requestStepUp = React.useCallback(
    (params: {
      reason: StepUpReason;
      targetRole?: Role;
      contextDescription?: string;
      onSuccess?: () => Promise<void> | void;
    }) => {
      setStepUpState({
        open: true,
        reason: params.reason,
        targetRole: params.targetRole,
        contextDescription: params.contextDescription,
        onSuccessCallback: params.onSuccess,
      });
    },
    []
  );

  const closeStepUp = React.useCallback(() => {
    setStepUpState(null);
  }, []);

  const switchRole = React.useCallback(
    async (role: Role): Promise<UserPublic | null> => {
      try {
        await authApi.switchActiveRole({ role });
        // Section 12: After login or role switching, refresh `/users/me`
        const refreshed = await usersApi.getMe();
        setUser(refreshed);
        toast({
          title: `Active role switched to ${role[0].toUpperCase()}${role.slice(1)}`,
          description: "Session cookie rotated and permissions synchronized.",
          variant: "success",
        });
        return refreshed;
      } catch (err) {
        if (err instanceof ApiError && err.stepUpReason) {
          requestStepUp({
            reason: err.stepUpReason,
            targetRole: role,
            contextDescription: `Activating the ${role} role requires step-up verification.`,
          });
          return null;
        }
        if (
          err instanceof ApiError &&
          err.status === 403 &&
          err.detail.toLowerCase().includes("revoked")
        ) {
          await refreshUser();
        }
        throw err;
      }
    },
    [refreshUser, requestStepUp, toast]
  );

  const clearSessionExpiredMessage = React.useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      apiMode: apiModeState,
      backendHealth,
      sessionExpiredMessage,
      clearSessionExpiredMessage,
      setMode,
      recheckBackendHealth,
      refreshUser,
      login,
      logout,
      logoutAll,
      clearLocalSession,
      switchRole,
      stepUpState,
      requestStepUp,
      closeStepUp,
    }),
    [
      user,
      isLoading,
      apiModeState,
      backendHealth,
      sessionExpiredMessage,
      clearSessionExpiredMessage,
      setMode,
      recheckBackendHealth,
      refreshUser,
      login,
      logout,
      logoutAll,
      clearLocalSession,
      switchRole,
      stepUpState,
      requestStepUp,
      closeStepUp,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
