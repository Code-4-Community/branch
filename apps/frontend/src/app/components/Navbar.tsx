"use client";
import Image from "next/image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PT_Sans } from "next/font/google";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { assetPath } from "@/lib/asset";
import { normalizePath, projectPath } from "@/lib/routes";
import type { ProjectSummary } from "@/types";
import LoadingState from "./LoadingState";

const ptSans = PT_Sans({ subsets: ["latin"], weight: ["400", "700"] });

// ─── Types & Definitions ──────────────────────────────────────────────────────

export type UserRole = "admin" | "standard" | "limited";
interface NavItem {
  label: string;
  href?: string;
  action?: "logout";
  roles?: UserRole[];
  /** Renders the expandable project list beneath this item. */
  submenu?: "projects";
}

// Every href here must resolve to a real route. "Profile" was removed because
// no /profile page exists, and "Log Out" is an action rather than a route —
// keying the special case on `action` means a future /logout page couldn't
// silently turn the button back into a dead link.
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", roles: ["admin"] },
  { label: "Projects", href: "/projects", submenu: "projects" },
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

/** Figma sizes every nav row at 37px with 8px/12px padding and 16px type. */
const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: 37,
  padding: "8px 12px",
  fontSize: 16,
  textAlign: "left",
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background-color 0.2s ease",
};

/**
 * Flyout listing every project the user can see, so the sidebar can jump
 * straight into a project instead of routing through the list page first.
 */
function ProjectsSubmenu({
  projects,
  isLoading,
  error,
  activeProjectId,
  onNavigate,
}: {
  projects: ProjectSummary[];
  isLoading: boolean;
  error: string | null;
  activeProjectId: number | null;
  onNavigate: () => void;
}) {
  const optionStyle: React.CSSProperties = {
    display: "block",
    padding: "8px 12px",
    minHeight: 37,
    fontSize: 16,
    textDecoration: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <div
      role="menu"
      aria-label="Projects"
      // Anchored to the right of the 181px rail as in the design. `max-h` +
      // scroll keeps it usable for an org with far more projects than the
      // three the mock shows.
      className="absolute left-full top-0 z-30 ml-1 max-h-[60vh] w-[203px] overflow-y-auto rounded-[4px] !border-[1px] !border-solid !border-black-500 bg-core-white shadow-lg"
    >
      <Link
        href="/projects"
        role="menuitem"
        onClick={onNavigate}
        style={{ ...optionStyle, color: "var(--color-black-700)" }}
        className="hover:!bg-black-100"
      >
        All Projects
      </Link>

      {isLoading && <LoadingState label="Loading projects…" size="sm" variant="inline" />}
      {error && (
        <p style={{ ...optionStyle, color: "var(--color-error-red)" }}>{error}</p>
      )}
      {!isLoading && !error && projects.length === 0 && (
        <p style={{ ...optionStyle, color: "var(--color-black-700)" }}>No projects yet</p>
      )}

      {projects.map((project) => {
        const isCurrent = project.project_id === activeProjectId;
        return (
          <Link
            key={project.project_id}
            href={projectPath(project.project_id)}
            role="menuitem"
            onClick={onNavigate}
            aria-current={isCurrent ? "page" : undefined}
            title={project.name}
            style={{
              ...optionStyle,
              backgroundColor: isCurrent ? "var(--color-core-green)" : "transparent",
              color: isCurrent ? COLORS.white : "var(--color-black-700)",
              fontWeight: isCurrent ? 700 : 400,
            }}
            className={isCurrent ? undefined : "hover:!bg-black-100"}
          >
            {project.name}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * `roleOverride` exists for tests only — it is named that way so nobody mistakes
 * it for the source of truth again. The role comes from the session, which comes
 * from GET /auth/me; it used to default to "admin", which made the role-based
 * filtering below purely decorative. Hiding a link was never a security control
 * anyway — AuthGate enforces admin routes.
 */
export const NavBar: React.FC<{
  roleOverride?: UserRole;
  activePath?: string;
  /**
   * Which project the flyout should mark as current. Passed in rather than
   * derived from the URL because the id is a query param, and reading it here
   * with `useSearchParams` would force a Suspense boundary onto every page that
   * renders the rail.
   */
  activeProjectId?: number | null;
}> = ({
  roleOverride,
  activePath,
  activeProjectId = null
}) => {
  const pathname = usePathname?.() ?? "/";
  const currentPath = normalizePath(activePath ?? pathname);
  const router = useRouter();
  const { logout, isAdmin } = useAuth();
  const api = useApi();

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Collapsed by default, including on a project page: the flyout overlaps the
  // content beside the rail, so opening it automatically would cover the very
  // page the user just navigated to.
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  // Starts as loading: the menu only renders once expanded, and expanding
  // always triggers a load — defaulting to false made "No projects yet" flash
  // before the first response arrived.
  const [projectsState, setProjectsState] = useState<{ loading: boolean; error: string | null }>({
    loading: true,
    error: null,
  });
  const hasLoadedProjects = useRef(false);
  const submenuRef = useRef<HTMLLIElement | null>(null);

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

  // Fetched on first expand rather than on mount: the list is only ever read by
  // this menu, and eagerly loading it would add a request to every page.
  const loadProjects = useCallback(async () => {
    if (hasLoadedProjects.current) return;
    hasLoadedProjects.current = true;
    setProjectsState({ loading: true, error: null });
    try {
      const rows = await api.get<ProjectSummary[]>("/projects");
      setProjects(Array.isArray(rows) ? rows : []);
      setProjectsState({ loading: false, error: null });
    } catch {
      // Retryable: clearing the latch lets the next expand try again.
      hasLoadedProjects.current = false;
      setProjectsState({ loading: false, error: "Could not load projects" });
    }
  }, [api]);

  useEffect(() => {
    if (projectsOpen) void loadProjects();
  }, [projectsOpen, loadProjects]);

  // Dismiss on outside click and Escape, the two things a flyout must honour.
  useEffect(() => {
    if (!projectsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (submenuRef.current && !submenuRef.current.contains(event.target as Node)) {
        setProjectsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjectsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [projectsOpen]);

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
        // `visible` so the projects flyout can escape the rail; the background
        // image is clipped by its own wrapper instead.
        overflow: "visible",
      }}
    >
      {/* Background Image Layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }}>
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
              ...ROW_STYLE,
              backgroundColor: active
                ? COLORS.white
                : (isHovered ? COLORS.hoverBg : "transparent"),
              color: active ? "var(--color-core-black)" : COLORS.white,
              fontWeight: active ? 700 : 400,
            };

            if (item.submenu === "projects" && item.href) {
              return (
                <li
                  key={item.label}
                  ref={submenuRef}
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* The label navigates and the chevron expands: a single
                      control cannot do both, and collapsing them would make the
                      list page unreachable from the sidebar. */}
                  <div style={{ ...sharedStyle, gap: 8, padding: 0 }}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      style={{
                        ...ROW_STYLE,
                        flex: 1,
                        minWidth: 0,
                        backgroundColor: "transparent",
                        color: "inherit",
                        fontWeight: "inherit",
                      }}
                    >
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setProjectsOpen((open) => !open)}
                      aria-expanded={projectsOpen}
                      aria-haspopup="menu"
                      aria-label={projectsOpen ? "Collapse project list" : "Expand project list"}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        alignSelf: "stretch",
                        background: "transparent",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {projectsOpen ? <LuChevronDown size={20} /> : <LuChevronRight size={20} />}
                    </button>
                  </div>

                  {projectsOpen && (
                    <ProjectsSubmenu
                      projects={projects}
                      isLoading={projectsState.loading}
                      error={projectsState.error}
                      activeProjectId={activeProjectId}
                      onNavigate={() => setProjectsOpen(false)}
                    />
                  )}
                </li>
              );
            }

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
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    style={sharedStyle}
                  >
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
