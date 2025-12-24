import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  GraduationCap,
  LogOut,
  Menu,
  CheckSquare,
  FileText,
  Megaphone,
  UserCog,
  Target,
  Settings2,
  Shield,
  Settings,
  Cog,
  ChevronDown,
  Database,
  User,
  UsersRound,
  Bell,
  ClipboardList,
  CalendarDays,
  PenSquare,
  History,
  TrendingUp,
  BarChart3,
  Home,
  MoreHorizontal,
  X,
  Sun,
  Moon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { SearchInput } from "@/components/ui/search-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MainLayoutProps {
  children: React.ReactNode;
}

interface SubNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  policy: string | null;
  subItems?: SubNavItem[];
}

const navItems: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", policy: null },
  { href: "/users", icon: UserCog, label: "User Management", policy: "users.view" },
  { 
    icon: Users, 
    label: "Members", 
    policy: "employees.view",
    subItems: [
      { href: "/employees", icon: UsersRound, label: "All Members" },
      { href: "/attendance/history", icon: History, label: "Task History" },
      { href: "/sales", icon: TrendingUp, label: "Sales" },
      { href: "/sales-staff", icon: BarChart3, label: "Sales Staff" },
    ]
  },
  { 
    icon: CalendarCheck, 
    label: "Work Log", 
    policy: "attendance.view",
    subItems: [
      { href: "/attendance", icon: ClipboardList, label: "My Work Log" },
      { href: "/attendance/today", icon: CalendarDays, label: "Today Work Log" },
      { href: "/attendance/fill", icon: PenSquare, label: "Fill Work Log" },
      { href: "/attendance/history", icon: History, label: "Task History" },
    ]
  },
  { 
    icon: Target, 
    label: "Targets & Goals", 
    policy: null,
    subItems: [
      { href: "/targets/my", icon: User, label: "My Targets" },
      { href: "/targets/team", icon: UsersRound, label: "Team Targets" },
    ]
  },
  { 
    icon: CheckSquare, 
    label: "Tasks", 
    policy: "tasks.view",
    subItems: [
      { href: "/tasks/my", icon: User, label: "My Tasks" },
      { href: "/tasks/team", icon: UsersRound, label: "Team Tasks" },
    ]
  },
  { 
    icon: FileText, 
    label: "Claims", 
    policy: "claims.view",
    subItems: [
      { href: "/claims/my", icon: User, label: "My Claims" },
      { href: "/claims/team", icon: UsersRound, label: "Team Claims" },
    ]
  },
  { 
    icon: Megaphone, 
    label: "Announcements", 
    policy: "announcements.view",
    subItems: [
      { href: "/announcements/my", icon: User, label: "My Announcements" },
      { href: "/announcements/team", icon: UsersRound, label: "Team Announcements" },
    ]
  },
  { 
    icon: Settings2, 
    label: "Integrations", 
    policy: "admin.panel",
    subItems: [
      { href: "/admin/routing", icon: Cog, label: "API Routing" },
      { href: "/admin/master-settings", icon: Database, label: "Master Settings" },
      { href: "/integrations/fetched-data", icon: Database, label: "Fetched Data" },
    ]
  },
  { href: "/training", icon: GraduationCap, label: "Training", policy: null },
  { href: "/settings", icon: Settings, label: "Settings", policy: null },
  // Standalone Sales Staff for employees (hidden for MDO who see it under Targets)
  { href: "/sales-staff", icon: BarChart3, label: "Sales Staff", policy: null },
];

const adminItems: NavItem[] = [];

// Mobile bottom navigation items (base list - will be filtered by role)
const baseMobileNavItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/attendance", icon: CalendarCheck, label: "Work Log" },
  { href: "/targets/my", icon: Target, label: "Targets" },
  { href: "/tasks/my", icon: CheckSquare, label: "Tasks" },
];

const NavLink = React.memo(function NavLink({ 
  item, 
  isSubItem = false, 
  location, 
  onNavigate 
}: { 
  item: NavItem | SubNavItem; 
  isSubItem?: boolean; 
  location: string;
  onNavigate: () => void;
}) {
  const href = 'href' in item ? item.href : undefined;
  if (!href) return null;
  
  const isActive = location === href || (href !== "/" && location.startsWith(href));
  const IconComponent = item.icon;
  
  return (
    <Link href={href}>
      <span
        className={cn(
          "nav-item cursor-pointer group touch-manipulation",
          isSubItem && "pl-12 py-2.5",
          isActive
            ? "nav-item-active"
            : "nav-item-inactive"
        )}
        onClick={onNavigate}
      >
        <IconComponent className={cn(
          "h-5 w-5 transition-colors shrink-0",
          isSubItem && "h-4 w-4",
          isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
        )} />
        <span className="flex-1 truncate">{item.label}</span>
      </span>
    </Link>
  );
});

const NavItemWithSubmenu = React.memo(function NavItemWithSubmenu({ 
  item, 
  location, 
  isOpen, 
  onToggle, 
  onNavigate 
}: { 
  item: NavItem; 
  location: string;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasActiveChild = item.subItems?.some(
    sub => location === sub.href || location.startsWith(sub.href)
  );
  const IconComponent = item.icon;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "nav-item w-full group touch-manipulation",
          hasActiveChild
            ? "text-sidebar-foreground"
            : "nav-item-inactive"
        )}
      >
        <IconComponent className={cn(
          "h-5 w-5 transition-colors shrink-0",
          hasActiveChild ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
        )} />
        <span className="flex-1 text-left truncate">{item.label}</span>
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform duration-200 shrink-0",
          isOpen ? "rotate-180" : ""
        )} />
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-200",
        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="py-1 space-y-0.5">
          {item.subItems?.map((subItem) => (
            <NavLink 
              key={subItem.href} 
              item={subItem} 
              isSubItem 
              location={location}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

interface SidebarNavProps {
  visibleNavItems: NavItem[];
  visibleAdminItems: NavItem[];
  location: string;
  openMenus: Record<string, boolean>;
  toggleMenu: (label: string) => void;
  onNavigate: () => void;
  user: any;
  onSignOut: () => void;
}

const SidebarNav = React.memo(function SidebarNav({
  visibleNavItems,
  visibleAdminItems,
  location,
  openMenus,
  toggleMenu,
  onNavigate,
  user,
  onSignOut
}: SidebarNavProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = lastScrollRef.current;
    }
  }, [location]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      lastScrollRef.current = scrollContainerRef.current.scrollTop;
    }
  };

  const isMenuOpen = (label: string, subItems?: SubNavItem[]) => {
    if (openMenus[label] !== undefined) return openMenus[label];
    if (subItems) {
      return subItems.some(item => location === item.href || location.startsWith(item.href));
    }
    return false;
  };

  return (
    <div className="flex h-full flex-col bg-slate-900 border-r border-slate-800">
      <div className="flex h-14 sm:h-16 items-center px-4 sm:px-6 border-b border-sidebar-border/50 shrink-0">
        <Link href="/" className="flex items-center gap-2 sm:gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center">
            <span className="text-base sm:text-lg font-bold text-sidebar-primary">G</span>
          </div>
          <div>
            <h1 className="font-heading font-bold text-base sm:text-lg text-sidebar-foreground leading-none">Goyalsons</h1>
            <p className="text-[10px] sm:text-xs text-sidebar-foreground/60 mt-0.5">Management System</p>
          </div>
        </Link>
      </div>
      
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin py-3 sm:py-4 px-2 sm:px-3 overscroll-contain">
        <nav className="space-y-0.5 sm:space-y-1">
          {visibleNavItems.map((item) => (
            item.subItems ? (
              <NavItemWithSubmenu 
                key={item.label} 
                item={item} 
                location={location}
                isOpen={isMenuOpen(item.label, item.subItems)}
                onToggle={() => toggleMenu(item.label)}
                onNavigate={onNavigate}
              />
            ) : (
              <NavLink 
                key={item.href} 
                item={item} 
                location={location}
                onNavigate={onNavigate}
              />
            )
          ))}
          
          {visibleAdminItems.length > 0 && (
            <>
              <div className="mt-4 sm:mt-6 mb-2 sm:mb-3 px-3 sm:px-4">
                <p className="text-[10px] sm:text-[11px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">
                  Admin
                </p>
              </div>
              {visibleAdminItems.map((item) => (
                item.subItems ? (
                  <NavItemWithSubmenu 
                    key={item.label} 
                    item={item} 
                    location={location}
                    isOpen={isMenuOpen(item.label, item.subItems)}
                    onToggle={() => toggleMenu(item.label)}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <NavLink 
                    key={item.href} 
                    item={item} 
                    location={location}
                    onNavigate={onNavigate}
                  />
                )
              ))}
            </>
          )}
        </nav>
      </div>

      {user && (
        <div className="border-t border-sidebar-border/50 p-3 sm:p-4 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-xl bg-sidebar-accent/30">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs sm:text-sm font-bold text-sidebar-primary shrink-0">
              {user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
              <p className="text-[10px] sm:text-xs text-sidebar-foreground/60 truncate">
                {user.loginType === "employee" && user.employeeCardNo 
                  ? user.employeeCardNo 
                  : user.email}
              </p>
            </div>
            {user.isSuperAdmin && (
              <Shield className="h-3 w-3 sm:h-4 sm:w-4 text-amber-400 shrink-0" />
            )}
          </div>
          
          <Button 
            variant="ghost" 
            className="w-full mt-2 sm:mt-3 gap-2 justify-start text-sidebar-foreground/70 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors h-10 touch-manipulation"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );
});

// Mobile Bottom Navigation Component
function MobileBottomNav({ location }: { location: string }) {
  const [showMore, setShowMore] = useState(false);
  const { user, isEmployeeLogin } = useAuth();
  const isEmployee = isEmployeeLogin();
  const isMDO = user?.loginType === "mdo";
  
  // Filter mobile nav items based on role - hide Targets, Tasks, and Work Log from members
  const mobileNavItems = useMemo(() => {
    if (isEmployee) {
      // Members only see Home (Work Log is hidden)
      return baseMobileNavItems.filter(item => 
        item.href === "/"
      );
    }
    // MDO sees all items
    return baseMobileNavItems;
  }, [isEmployee]);
  
  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setShowMore(false)}
        />
      )}
      
      {/* More menu sheet */}
      {showMore && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 bg-white dark:bg-slate-900 rounded-t-2xl shadow-lg z-50 md:hidden animate-slide-up border-t border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">More Options</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowMore(false)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="p-2 max-h-[50vh] overflow-y-auto">
            {/* Hide Claims, Announcements, Training from members - MDO only */}
            {isMDO && (
              <>
                <Link href="/claims/my" onClick={() => setShowMore(false)}>
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-slate-700 dark:text-slate-300">My Claims</span>
                  </div>
                </Link>
                <Link href="/announcements/my" onClick={() => setShowMore(false)}>
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation">
                    <Megaphone className="h-5 w-5 text-muted-foreground" />
                    <span className="text-slate-700 dark:text-slate-300">Announcements</span>
                  </div>
                </Link>
                <Link href="/training" onClick={() => setShowMore(false)}>
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation">
                    <GraduationCap className="h-5 w-5 text-muted-foreground" />
                    <span className="text-slate-700 dark:text-slate-300">Training</span>
                  </div>
                </Link>
              </>
            )}
            {isMDO && (
            <Link href="/settings" onClick={() => setShowMore(false)}>
                <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation">
                <Settings className="h-5 w-5 text-muted-foreground" />
                  <span className="text-slate-700 dark:text-slate-300">Settings</span>
              </div>
            </Link>
            )}
          </div>
        </div>
      )}
      
      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const IconComponent = item.icon;
            
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex flex-col items-center justify-center min-w-[4rem] py-1 px-2 rounded-xl touch-manipulation transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  <IconComponent className={cn(
                    "h-5 w-5 mb-0.5",
                    isActive && "text-primary"
                  )} />
                  <span className={cn(
                    "text-[10px] font-medium",
                    isActive && "text-primary"
                  )}>{item.label}</span>
                </div>
              </Link>
            );
          })}
          
          {/* More button */}
          <button 
            onClick={() => setShowMore(!showMore)}
            className={cn(
              "flex flex-col items-center justify-center min-w-[4rem] py-1 px-2 rounded-xl touch-manipulation transition-colors",
              showMore ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5 mb-0.5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navItems.forEach(item => {
      if (item.subItems) {
        const hasActiveChild = item.subItems.some(
          sub => typeof window !== 'undefined' && (window.location.pathname === sub.href || window.location.pathname.startsWith(sub.href))
        );
        if (hasActiveChild) {
          initial[item.label] = true;
        }
      }
    });
    return initial;
  });
  const { user, logout, hasPolicy, hasRole, isEmployeeLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const toggleMenu = useCallback((label: string) => {
    setOpenMenus(prev => {
      const isCurrentlyOpen = prev[label];
      if (isCurrentlyOpen) {
        return { ...prev, [label]: false };
      }
      const newState: Record<string, boolean> = {};
      navItems.forEach(item => {
        if (item.subItems) {
          newState[item.label] = item.label === label;
        }
      });
      return newState;
    });
  }, []);

  const visibleNavItems = useMemo(() => {
    const isEmployee = isEmployeeLogin();
    const isMDO = user?.loginType === "mdo";
    const isSalesman = hasRole("Salesman");
    
    // Items members/employees should see (restricted list - no Targets, Tasks, Claims, Announcements, Training)
    // Work Log is partially visible - members see only Task History
    // Sales Staff is only for Salesman role
    const employeeAllowedItems = ["Dashboard", "Work Log"];
    if (isSalesman) {
      employeeAllowedItems.push("Sales Staff");
    }
    
    // Items that are MDO-only (hidden from members)
    const mdoOnlyItems = ["Targets & Goals", "Tasks", "Claims", "Announcements", "Training"];
    
    return navItems
      .filter(item => {
        // Settings is ONLY for MDO
        if (item.label === "Settings" && !isMDO) {
          return false;
        }

        // Hide Sales Staff from non-salesman users
        if (item.label === "Sales Staff" && !isSalesman) {
          return false;
        }

        // Hide MDO-only items from members
        if (isEmployee && mdoOnlyItems.includes(item.label)) {
          return false;
        }

        if (isEmployee) {
          // Members see only specific items regardless of policies
          return employeeAllowedItems.includes(item.label);
        }
        
        // MDO users: hide standalone "Sales Staff" (they see it under Members)
        if (item.label === "Sales Staff" && item.href === "/sales-staff") {
          return false;
        }
        
        // MDO users use policy-based filtering
        if (item.policy !== null && !hasPolicy(item.policy)) return false;
        return true;
      })
      .map(item => {
        if (!item.subItems) return item;
        
        // For MDO users: filter out Task History from Work Log (they see it under Members)
        if (!isEmployee && item.label === "Work Log") {
          return { ...item, subItems: item.subItems.filter(sub => sub.label !== "Task History") };
        }
        
        // For members: show only Task History from Work Log section (hide My Work Log, Today Work Log, Fill Work Log)
        if (isEmployee && item.label === "Work Log") {
          return { 
            ...item, 
            subItems: item.subItems.filter(sub => sub.label === "Task History") 
          };
        }
        
        // Filter Sales Staff from Members section for non-salesman users (but allow MDO users to see it)
        if (item.label === "Members" && !isSalesman && isEmployee) {
          return {
            ...item,
            subItems: item.subItems.filter(sub => sub.label !== "Sales Staff")
          };
        }
        
        return item;
      });
  }, [hasPolicy, isEmployeeLogin, hasRole, user]);
  
  const visibleAdminItems = useMemo(() => {
    if (isEmployeeLogin()) return [];
    return adminItems.filter(item => item.policy === null || hasPolicy(item.policy));
  }, [hasPolicy, isEmployeeLogin]);

  const handleSignOut = useCallback(async () => {
    await logout();
  }, [logout]);

  const handleNavigate = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const getPageTitle = () => {
    const path = location;
    if (path === "/") return "Dashboard";
    const segment = path.split("/").filter(Boolean)[0];
    
    // Map specific routes to custom titles
    const titleMap: Record<string, string> = {
      attendance: "Work log",
      tasks: "Tasks",
      claims: "Claims",
      announcements: "Announcements",
      targets: "Targets",
      users: "Users",
      employees: "Members",
      settings: "Settings",
      training: "Training",
      sales: "Sales",
      admin: "Admin",
      roles: "Roles",
      integrations: "Integrations",
    };
    
    if (segment && titleMap[segment.toLowerCase()]) {
      return titleMap[segment.toLowerCase()];
    }
    
    return segment ? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ") : "Dashboard";
  };

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar - large screens */}
      <div className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 z-50">
        <SidebarNav
          visibleNavItems={visibleNavItems}
          visibleAdminItems={visibleAdminItems}
          location={location}
          openMenus={openMenus}
          toggleMenu={toggleMenu}
          onNavigate={handleNavigate}
          user={user}
          onSignOut={handleSignOut}
        />
      </div>

      {/* Tablet sidebar - medium screens */}
      <div className="hidden md:flex md:w-64 lg:hidden md:flex-col md:fixed md:inset-y-0 z-50">
        <SidebarNav
          visibleNavItems={visibleNavItems}
          visibleAdminItems={visibleAdminItems}
          location={location}
          openMenus={openMenus}
          toggleMenu={toggleMenu}
          onNavigate={handleNavigate}
          user={user}
          onSignOut={handleSignOut}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 md:pl-64 lg:pl-72 pb-20 md:pb-0 min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-14 sm:h-16 items-center gap-2 sm:gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 sm:px-4 md:px-6 shadow-sm">
          {/* Mobile menu button */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 md:hidden rounded-xl h-9 w-9 touch-manipulation"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px] sm:w-72 border-r-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SidebarNav
                visibleNavItems={visibleNavItems}
                visibleAdminItems={visibleAdminItems}
                location={location}
                openMenus={openMenus}
                toggleMenu={toggleMenu}
                onNavigate={handleNavigate}
                user={user}
                onSignOut={handleSignOut}
              />
            </SheetContent>
          </Sheet>

          <div className="flex-1 flex items-center gap-2 sm:gap-4 min-w-0">
            <h1 className="text-base sm:text-lg font-semibold md:hidden truncate text-slate-900 dark:text-slate-100">{getPageTitle()}</h1>
            
            {/* Search - hidden on mobile */}
            <div className="hidden sm:flex max-w-md flex-1">
              <SearchInput 
                placeholder="Search members, tasks..." 
                onSearch={(value) => {
                  if (value.trim()) {
                    window.location.href = `/employees?search=${encodeURIComponent(value.trim())}`;
                  }
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-9 w-9"
              onClick={toggleTheme}
            >
              {theme === "light" ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* Notifications - hidden on mobile */}
            <Button variant="ghost" size="icon" className="relative rounded-xl hidden sm:flex h-9 w-9">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full" />
            </Button>

            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-1 sm:gap-2 rounded-xl px-1.5 sm:px-2 py-1.5 h-auto touch-manipulation">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8 border border-border">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm font-medium">
                      {user?.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground hidden sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.loginType === "employee" && user?.employeeCardNo 
                        ? user.employeeCardNo 
                        : user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-800" />
                {user?.loginType === "mdo" && (
                <Link href="/settings">
                    <DropdownMenuItem className="cursor-pointer rounded-lg touch-manipulation hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                </Link>
                )}
                <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-800" />
                <DropdownMenuItem 
                  className="cursor-pointer text-destructive focus:text-destructive rounded-lg touch-manipulation hover:bg-destructive/10 dark:hover:bg-destructive/20"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile bottom navigation */}
      <MobileBottomNav location={location} />
    </div>
  );
}
