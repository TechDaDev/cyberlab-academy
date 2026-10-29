import {
  BookOpen,
  BookOpenCheck,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Library,
  LockKeyhole,
  PencilRuler,
  Settings,
  Shield,
  ShieldCheck,
  Terminal,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types/api";

export interface RoleMetadata {
  role: Role;
  label: string;
  shortCode: string;
  dashboardPath: string;
  tagline: string;
  badgeVariant: "default" | "teal" | "violet" | "warning";
  requiresStepUp: boolean;
  requiresMfa: boolean;
  capabilities: string[];
  icon: LucideIcon;
}

export const ROLE_METADATA: Record<Role, RoleMetadata> = {
  student: {
    role: "student",
    label: "Student",
    shortCode: "STU",
    dashboardPath: "/dashboard/student",
    tagline: "Interactive cybersecurity curriculum, guided labs, and mission briefings",
    badgeVariant: "default",
    requiresStepUp: false,
    requiresMfa: false,
    capabilities: [
      "Manage personal profile, email verification, sessions, and MFA",
      "Access theoretical cybersecurity modules and simulation briefings (Demo preview)",
      "Track personal skill progression and achievements (Demo preview)",
    ],
    icon: GraduationCap,
  },
  instructor: {
    role: "instructor",
    label: "Instructor",
    shortCode: "INS",
    dashboardPath: "/dashboard/instructor",
    tagline: "Assigned cohort instruction, lab readiness, and mission evaluation",
    badgeVariant: "teal",
    requiresStepUp: false,
    requiresMfa: false,
    capabilities: [
      "Oversee assigned cybersecurity cohorts and student readiness (Demo preview)",
      "Monitor mission completion telemetry and lab assignments (Demo preview)",
      "Maintain verified instructor profile and session security",
    ],
    icon: BookOpen,
  },
  manager: {
    role: "manager",
    label: "Manager",
    shortCode: "MGR",
    dashboardPath: "/dashboard/manager",
    tagline: "Student & Instructor lifecycle governance and instructor approvals",
    badgeVariant: "violet",
    requiresStepUp: true,
    requiresMfa: false,
    capabilities: [
      "Search, inspect, suspend, and reactivate Student & Instructor accounts",
      "Review, approve, or reject pending Instructor applications with audit reasons",
      "Grant or revoke Student and Instructor roles (cannot modify Manager/Administrator)",
    ],
    icon: UserCheck,
  },
  administrator: {
    role: "administrator",
    label: "Administrator",
    shortCode: "ADM",
    dashboardPath: "/dashboard/admin",
    tagline: "MFA-enforced platform governance, privileged roles, and security controls",
    badgeVariant: "warning",
    requiresStepUp: true,
    requiresMfa: true,
    capabilities: [
      "Full user administration across Student, Instructor, Manager, and Administrator roles",
      "Assign and revoke Manager and Administrator privileges with last-Admin protection",
      "MFA-verified session enforcement and platform security posture oversight",
    ],
    icon: ShieldCheck,
  },
};

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  description?: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

export function getNavigationForRole(activeRole: Role): NavSection[] {
  const rolePrimary: Record<Role, NavSection> = {
    student: {
      heading: "Learning Command",
      items: [
        {
          label: "Student Dashboard",
          href: "/dashboard/student",
          icon: LayoutDashboard,
          description: "Overview, modules & missions",
        },
        {
          label: "Curriculum Modules",
          href: "/dashboard/student#modules",
          icon: BookOpen,
          badge: "Demo",
        },
        {
          label: "Mission Range",
          href: "/dashboard/student#missions",
          icon: Terminal,
          badge: "Demo",
        },
      ],
    },
    instructor: {
      heading: "Teaching Operations",
      items: [
        {
          label: "Instructor Dashboard",
          href: "/dashboard/instructor",
          icon: LayoutDashboard,
          description: "Cohorts, students & evaluations",
        },
        {
          label: "Assigned Cohorts",
          href: "/dashboard/instructor#classes",
          icon: GraduationCap,
          badge: "Demo",
        },
        {
          label: "Mission Analytics",
          href: "/dashboard/instructor#analytics",
          icon: Terminal,
          badge: "Demo",
        },
      ],
    },
    manager: {
      heading: "Account Governance",
      items: [
        {
          label: "Manager Console",
          href: "/dashboard/manager",
          icon: LayoutDashboard,
          description: "Live Student & Instructor directory",
        },
        {
          label: "User Directory",
          href: "/dashboard/manager#users",
          icon: Users,
        },
        {
          label: "Instructor Applications",
          href: "/dashboard/manager#applications",
          icon: UserCheck,
        },
      ],
    },
    administrator: {
      heading: "Platform Command",
      items: [
        {
          label: "Admin Control Center",
          href: "/dashboard/admin",
          icon: ShieldCheck,
          description: "Privileged governance & MFA security",
        },
        {
          label: "All Accounts & Roles",
          href: "/dashboard/admin#users",
          icon: Users,
        },
        {
          label: "Privileged Governance",
          href: "/dashboard/admin#privileged",
          icon: Shield,
        },
        {
          label: "Instructor Reviews",
          href: "/dashboard/admin#applications",
          icon: UserCheck,
        },
      ],
    },
  };


  const academicsPrimary: Record<Role, NavSection> = {
    student: {
      heading: "Academic Catalog",
      items: [
        {
          label: "Course Catalog",
          href: "/academics",
          icon: Library,
          description: "Published CEH curriculum",
        },
        {
          label: "My Classes",
          href: "/academics/learn",
          icon: BookOpenCheck,
          description: "Own enrollments and course access",
        },
        {
          label: "Available Modules",
          href: "/academics#available-modules",
          icon: BookOpen,
          description: "Published modules only",
        },
      ],
    },
    instructor: {
      heading: "Academic Catalog",
      items: [
        {
          label: "Course Catalog",
          href: "/academics",
          icon: Library,
          description: "Published CEH curriculum",
        },
        {
          label: "Assigned Classes",
          href: "/academics/teach",
          icon: Users,
          description: "Live teaching assignments & rosters",
        },
        {
          label: "Curriculum Explorer",
          href: "/academics#available-modules",
          icon: BookOpen,
          description: "Module and lesson sequencing",
        },
      ],
    },
    manager: {
      heading: "Academic Catalog",
      items: [
        {
          label: "Course Catalog",
          href: "/academics",
          icon: Library,
          description: "Published CEH curriculum",
        },
        {
          label: "Content Management",
          href: "/academics/manage",
          icon: PencilRuler,
          description: "Draft courses, modules and lessons",
        },
        {
          label: "Class Management",
          href: "/academics/manage/cohorts",
          icon: GraduationCap,
          description: "Classes, instructors & enrollments",
        },
      ],
    },
    administrator: {
      heading: "Academic Catalog",
      items: [
        {
          label: "Course Catalog",
          href: "/academics",
          icon: Library,
          description: "Published CEH curriculum",
        },
        {
          label: "Academic Administration",
          href: "/academics/manage",
          icon: PencilRuler,
          description: "Curriculum lifecycle control",
        },
        {
          label: "Class Management",
          href: "/academics/manage/cohorts",
          icon: GraduationCap,
          description: "Classes, instructors & enrollments",
        },
      ],
    },
  };

  return [
    rolePrimary[activeRole],
    academicsPrimary[activeRole],
    {
      heading: "Account & Security",
      items: [
        {
          label: "Profile & Identity",
          href: "/settings/profile",
          icon: Settings,
        },
        {
          label: "Password & Step-Up",
          href: "/settings/security",
          icon: KeyRound,
        },
        {
          label: "Active Sessions",
          href: "/settings/sessions",
          icon: Users,
        },
        {
          label: "Multi-Factor Auth",
          href: "/settings/mfa",
          icon: LockKeyhole,
        },
      ],
    },
  ];
}
