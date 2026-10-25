import { z } from "zod";
import { evaluatePasswordPolicy } from "@/lib/utils";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberEmail: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must contain at least 2 characters")
      .max(160, "Full name cannot exceed 160 characters"),
    email: z
      .string()
      .trim()
      .min(1, "Email address is required")
      .email("Enter a valid email address"),
    password: z
      .string()
      .min(12, "Password must be 12 to 128 characters")
      .max(128, "Password must be 12 to 128 characters"),
    password_confirmation: z
      .string()
      .min(1, "Please confirm your password"),
    instructor_application: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const check = evaluatePasswordPolicy({
      password: data.password,
      confirmation: data.password_confirmation,
      email: data.email,
      fullName: data.full_name,
    });
    if (!check.notCommon) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password is too common",
      });
    }
    if (!check.excludesEmailLocal) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must not contain email name",
      });
    }
    if (!check.excludesFullName) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must not contain full name",
      });
    }
    if (!check.matchesConfirmation) {
      ctx.addIssue({
        code: "custom",
        path: ["password_confirmation"],
        message: "Passwords do not match",
      });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const emailOnlySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Enter a valid email address"),
});

export type EmailOnlyFormValues = z.infer<typeof emailOnlySchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Password must be 12 to 128 characters")
      .max(128, "Password must be 12 to 128 characters"),
    password_confirmation: z
      .string()
      .min(1, "Please confirm your new password"),
  })
  .superRefine((data, ctx) => {
    const check = evaluatePasswordPolicy({
      password: data.password,
      confirmation: data.password_confirmation,
    });
    if (!check.notCommon) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password is too common",
      });
    }
    if (!check.matchesConfirmation) {
      ctx.addIssue({
        code: "custom",
        path: ["password_confirmation"],
        message: "Passwords do not match",
      });
    }
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const profileUpdateSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Full name must contain at least 2 characters")
    .max(160, "Full name cannot exceed 160 characters"),
});

export type ProfileUpdateFormValues = z.infer<typeof profileUpdateSchema>;

export const changeEmailSchema = z.object({
  new_email: z
    .string()
    .trim()
    .min(1, "New email address is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Current password is required"),
});

export type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>;

export function createChangePasswordSchema(context: {
  email?: string;
  fullName?: string;
}) {
  return z
    .object({
      current_password: z.string().min(1, "Current password is required"),
      new_password: z
        .string()
        .min(12, "Password must be 12 to 128 characters")
        .max(128, "Password must be 12 to 128 characters"),
      new_password_confirmation: z
        .string()
        .min(1, "Please confirm your new password"),
    })
    .superRefine((data, ctx) => {
      const check = evaluatePasswordPolicy({
        password: data.new_password,
        confirmation: data.new_password_confirmation,
        email: context.email,
        fullName: context.fullName,
      });
      if (!check.notCommon) {
        ctx.addIssue({
          code: "custom",
          path: ["new_password"],
          message: "Password is too common",
        });
      }
      if (!check.excludesEmailLocal) {
        ctx.addIssue({
          code: "custom",
          path: ["new_password"],
          message: "Password must not contain email name",
        });
      }
      if (!check.excludesFullName) {
        ctx.addIssue({
          code: "custom",
          path: ["new_password"],
          message: "Password must not contain full name",
        });
      }
      if (!check.matchesConfirmation) {
        ctx.addIssue({
          code: "custom",
          path: ["new_password_confirmation"],
          message: "Passwords do not match",
        });
      }
    });
}

export type ChangePasswordFormValues = z.infer<
  ReturnType<typeof createChangePasswordSchema>
>;

export const mfaEnrollSchema = z.object({
  password: z.string().min(1, "Current password is required"),
});

export type MfaEnrollFormValues = z.infer<typeof mfaEnrollSchema>;

export const mfaConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit authenticator code"),
});

export type MfaConfirmFormValues = z.infer<typeof mfaConfirmSchema>;
