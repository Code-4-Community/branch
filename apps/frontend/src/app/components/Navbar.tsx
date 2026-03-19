"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PT_Sans } from "next/font/google";

const ptSans = PT_Sans({ subsets: ["latin"], weight: ["400", "700"] });

// ─── Types & Definitions ──────────────────────────────────────────────────────

export type UserRole = "admin" | "standard" | "limited";
interface NavItem { label: string; href: string; roles?: UserRole[]; }

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Projects",  href: "/projects" },
  { label: "Donors",    href: "/donors" },
  { label: "Donations", href: "/donations" },
  { label: "Expenses",  href: "/expenses",  roles: ["admin"] },
  { label: "Reports",   href: "/reports",   roles: ["admin"] },
  { label: "Accounts",  href: "/accounts",  roles: ["admin"] },
  { label: "Profile",   href: "/profile" },
  { label: "Log Out",   href: "/logout" },
];

const COLORS = {
  white: "#FFFFFF",
  brandGreen: "#2E6038", // Your requested color
  // Overlay version of 2E6038 at 85% opacity for better visibility
  menuOverlay: "rgba(46, 96, 56, 0.75)", 
  hoverBg: "rgba(255, 255, 255, 0.2)",
};

export const NavBar: React.FC<{ role?: UserRole; activePath?: string }> = ({ 
  role = "admin", 
  activePath 
}) => {
  const pathname = usePathname?.() ?? "/dashboard";
  const currentPath = activePath ?? pathname;
  
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const visibleItems = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role));
  const isActive = (href: string) => currentPath === href || (href !== "/" && currentPath.startsWith(href));

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
        overflow: "hidden"
      }}
    >
      {/* Background Image Layer */}
      <img
        src="/leaves-bg.png"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
        }}
      />

      {/* Logo Section (No overlay here, just like Figma) */}
      <div style={{
        position: "relative",
        zIndex: 1,
        padding: "45px 0 25px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <img src="/branch-logo.png" alt="Branch" width={75} height={75} />
        <div style={{ 
          color: COLORS.white, 
          fontSize: 18, 
          marginTop: 8, 
          fontWeight: 400,
          letterSpacing: "0.05em" 
        }}>
          BRANCH
        </div>
      </div>

      {/* Nav Overlay Section (Uses #2E6038 with opacity) */}
      <div style={{
        position: "relative",
        zIndex: 2,
        backgroundColor: COLORS.menuOverlay,
        flexGrow: 1,
        paddingTop: "4px"
      }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visibleItems.map((item, index) => {
            const active = isActive(item.href);
            const isHovered = hoveredIndex === index;

            return (
              <li 
                key={item.href}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <Link
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "12px 24px",
                    fontSize: "15px",
                    textDecoration: "none",
                    transition: "background-color 0.2s ease",
                    
                    // State Styling
                    backgroundColor: active 
                      ? COLORS.white 
                      : (isHovered ? COLORS.hoverBg : "transparent"),
                    color: active ? COLORS.brandGreen : COLORS.white,
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bottom spacer to keep the overlay full-height */}
      <div style={{ height: "40px", backgroundColor: COLORS.menuOverlay, zIndex: 2 }} />
    </nav>
  );
};

export default NavBar;