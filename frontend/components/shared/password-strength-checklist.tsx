import * as React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn, evaluatePasswordPolicy } from "@/lib/utils";

interface PasswordStrengthChecklistProps {
  password: string;
  confirmation?: string;
  email?: string;
  fullName?: string;
  className?: string;
}

export function PasswordStrengthChecklist({
  password,
  confirmation,
  email,
  fullName,
  className,
}: PasswordStrengthChecklistProps) {
  const check = evaluatePasswordPolicy({
    password,
    confirmation,
    email,
    fullName,
  });

  const rules = [
    {
      key: "length",
      label: "12 to 128 characters required",
      passed: check.validLength,
    },
    {
      key: "common",
      label: "Not a disallowed common passphrase",
      passed: check.notCommon,
    },
    {
      key: "email",
      label: "Does not contain your email username",
      passed: check.excludesEmailLocal && password.length > 0,
    },
    ...(fullName !== undefined
      ? [
          {
            key: "name",
            label: "Does not contain your full name",
            passed: check.excludesFullName && password.length > 0,
          },
        ]
      : []),
    ...(confirmation !== undefined
      ? [
          {
            key: "confirm",
            label: "Matches password confirmation",
            passed: check.matchesConfirmation,
          },
        ]
      : []),
  ];

  const passedCount = rules.filter((r) => r.passed).length;
  const pct = Math.round((passedCount / rules.length) * 100);

  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-surface-elevated/45 p-3 space-y-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">
          Security Policy Compliance
        </span>
        <span className="font-mono text-[11px] text-cyan-500 dark:text-cyan-300">
          {passedCount}/{rules.length} checks
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={cn(
            "h-full transition-all duration-300",
            pct === 100
              ? "bg-emerald-500"
              : pct >= 50
              ? "bg-cyan-500"
              : "bg-amber-500"
          )}
          style={{ width: `${password.length === 0 ? 0 : pct}%` }}
        />
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              rule.passed ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"
            )}
          >
            {rule.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
