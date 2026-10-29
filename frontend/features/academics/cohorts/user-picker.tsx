"use client";

import * as React from "react";
import { Loader2, Search, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeAcademicError } from "@/features/academics/error-message";
import { useApiResource } from "@/features/academics/use-api-resource";
import { cohortsApi } from "@/lib/api/cohorts";
import type { AdminUserPublic, Role } from "@/lib/types/api";

const MIN_QUERY_LENGTH = 2;

/**
 * Account search for class assignment and enrollment.
 *
 * Backed by the existing administrative directory (`GET /admin/users`) filtered
 * server-side by role and activity, so eligibility is decided by the API rather
 * than by anything typed here. Operators pick a person by name — never a UUID.
 *
 * Eligibility is *not* inferred client-side: the directory filter narrows the
 * list, and the assignment/enrollment endpoint still re-validates every rule and
 * answers `409` with its own reason. `hintFor` only surfaces the checks the
 * contract documents so an operator can see them before submitting.
 */
export function UserPicker({
  role,
  excludeIds = [],
  onSelect,
  disabled,
  hintFor,
  placeholder,
  emptyLabel,
}: {
  role: Role;
  /** Accounts already assigned/enrolled — hidden from the results. */
  excludeIds?: string[];
  onSelect: (user: AdminUserPublic) => void;
  disabled?: boolean;
  /** Optional per-row eligibility note, e.g. unverified email. */
  hintFor?: (user: AdminUserPublic) => string | null;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = debounced.length >= MIN_QUERY_LENGTH;
  const { data, error, loading } = useApiResource<AdminUserPublic[]>(
    () =>
      searching
        ? cohortsApi.listEligibleUsers(role, debounced)
        : Promise.resolve([]),
    `user-picker:${role}:${searching ? debounced : ""}`
  );

  const excluded = new Set(excludeIds);
  const results = (data ?? []).filter((user) => !excluded.has(user.id));
  const copy = describeAcademicError(error);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            placeholder ??
            `Search ${role}s by name or email`
          }
          aria-label={`Search ${role} accounts`}
          disabled={disabled}
          className="pl-9"
        />
        {loading && searching ? (
          <Loader2
            aria-hidden="true"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-400"
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {copy.title}. {copy.description}
        </p>
      ) : null}

      {!searching && !error ? (
        <p className="text-[11px] text-muted-foreground">
          Type at least {MIN_QUERY_LENGTH} characters to search the account
          directory.
        </p>
      ) : null}

      {searching && !loading && !error && results.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {emptyLabel ??
            `No eligible ${role} accounts matched "${debounced}".`}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {results.map((user) => {
            const hint = hintFor?.(user) ?? null;
            const blocked = hint !== null;
            return (
              <li key={user.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-elevated/40 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {user.email_verified ? (
                      <UserCheck
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-emerald-400"
                      />
                    ) : (
                      <UserX
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-amber-400"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user.full_name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {user.email}
                      </p>
                      {hint ? (
                        <p className="mt-0.5 text-[11px] text-amber-400">{hint}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {user.email_verified ? null : (
                      <Badge
                        variant="warning"
                        className="font-mono text-[9px] uppercase"
                      >
                        Unverified
                      </Badge>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={blocked || disabled}
                      onClick={() => onSelect(user)}
                      aria-label={`Select ${user.full_name}`}
                    >
                      Select
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
