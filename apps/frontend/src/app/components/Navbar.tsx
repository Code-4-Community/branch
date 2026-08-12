"use client";
import Image from "next/image";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PT_Sans } from "next/font/google";
import { useAuth } from "@/context/AuthContext";
import { assetPath } from "@/lib/asset";
import { normalizePath } from "@/lib/routes";

const ptSans = PT_Sans({ subsets: ["latin"], weight: ["400", "700"] });

// ─── Types & Definitions ──────────────────────────────────────────────────────

export type UserRole = "admin" | "standard" | "limited";
interface NavItem { label: string; href?: string; action?: "logout"; roles?: UserRole[]; }

// Every href here must resolve to a real route. "Profile" was removed because
// no /profile page exists, and "Log Out" is an action rather than a route —
// keying the special case on `action` means a future /logout page couldn't
// silently turn the button back into a dead link.
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", roles: ["admin"] },
  { label: "Projects", href: "/projects" },
  { label: "Donors", href: "/donors" },
  { label: "Donations", href: "/donations" },
  { label: "Expenses", href: "/expenses" },
  { label: "Reports", href: "/reports", roles: ["admin"] },
  { label: "Accounts", href: "/accounts", roles: ["admin"] },
  { label: "Log Out", action: "logout" },
];

const COLORS = {
  white: "#FFFFFF",
  brandGreen: "#2E6038",
  menuOverlay: "rgba(46, 96, 56, 0.75)",
  hoverBg: "rgba(255, 255, 255, 0.2)",
};

/**
 * `roleOverride` exists for tests only — it is named that way so nobody mistakes
 * it for the source of truth again. The role comes from the session, which comes
 * from GET /auth/me; it used to default to "admin", which made the role-based
 * filtering below purely decorative. Hiding a link was never a security control
 * anyway — AuthGate enforces admin routes.
 */
export const NavBar: React.FC<{ roleOverride?: UserRole; activePath?: string }> = ({
  roleOverride,
  activePath
}) => {
  const pathname = usePathname?.() ?? "/";
  const currentPath = normalizePath(activePath ?? pathname);
  const router = useRouter();
  const { logout, isAdmin } = useAuth();

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const role: UserRole = roleOverride ?? (isAdmin ? "admin" : "standard");
  const visibleItems = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role));

  // Compare normalized paths: trailingSlash: true means production sees
  // "/expenses/" where dev and tests see "/expenses". The boundary check stops
  // "/projects" from highlighting for "/projects-archive".
  const isActive = (href: string) => {
    const target = normalizePath(href);
    if (currentPath === target) return true;
    return target !== "/" && currentPath.startsWith(`${target}/`);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      // replace, not push: Back should not return to an authenticated page.
      router.replace("/login");
    }
  };

  return (
    <nav
      className="branch-sidebar"
      style={{
        width: 181,
        minHeight: "100vh",
        backgroundColor: COLORS.brandGreen,
        display: "flex",
        flexDirection: "column",
        fontFamily: ptSans.style.fontFamily,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Image Layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Image
          src={assetPath("/leaves-bg.png")}
          alt=""
          fill
          style={{ objectFit: "cover" }}
        />
      </div>

      {/* Logo Section */}
      <div style={{
        position: "relative",
        zIndex: 1,
        padding: "45px 0 25px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <Image src={assetPath("/branch-logo.png")} alt="Branch" width={75} height={75} />
        <div style={{
          color: COLORS.white,
          fontSize: 18,
          marginTop: 8,
          fontWeight: 400,
          letterSpacing: "0.05em",
        }}>
          BRANCH
        </div>
      </div>

      {/* Nav Overlay Section */}
      <div style={{
        position: "relative",
        zIndex: 2,
        backgroundColor: COLORS.menuOverlay,
        flexGrow: 1,
        paddingTop: "4px",
      }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visibleItems.map((item, index) => {
            const isLogout = item.action === "logout";
            const active = item.href ? isActive(item.href) : false;
            const isHovered = hoveredIndex === index;

            const sharedStyle: React.CSSProperties = {
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "12px 24px",
              fontSize: "15px",
              textDecoration: "none",
              transition: "background-color 0.2s ease",
              backgroundColor: active
                ? COLORS.white
                : (isHovered ? COLORS.hoverBg : "transparent"),
              color: active ? COLORS.brandGreen : COLORS.white,
              fontWeight: active ? 700 : 400,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            };

            return (
              <li
                key={item.label}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {isLogout || !item.href ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    style={sharedStyle}
                  >
                    {loggingOut ? "Logging out…" : item.label}
                  </button>
                ) : (
                  <Link href={item.href} style={sharedStyle}>
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: "40px", backgroundColor: COLORS.menuOverlay, zIndex: 2 }} />
    </nav>
  );
};

export default NavBar;
