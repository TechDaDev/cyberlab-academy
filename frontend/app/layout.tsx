import type { Metadata } from "next";
import "@/styles/globals.css";
import { fontVariables } from "@/lib/fonts";
import { AuthProvider } from "@/features/auth/auth-context";
import { ThemeProvider } from "@/hooks/use-theme";
import { ToastStateProvider } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "CyberLab Academy — Interactive Cybersecurity Education & Range Platform",
    template: "%s | CyberLab Academy",
  },
  description:
    "Mission-based cybersecurity training platform combining structured theoretical foundations, deterministic browser laboratories, and SOC simulations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${fontVariables}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <ToastStateProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </ToastStateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
