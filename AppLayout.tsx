import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  LayoutDashboard, BookOpen, CalendarDays, ShoppingCart,
  Package, Archive, LogOut, ChefHat, Menu, X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/recipes", label: "Рецепты", icon: BookOpen },
  { href: "/menu", label: "Меню", icon: CalendarDays },
  { href: "/shopping", label: "Покупки", icon: ShoppingCart },
  { href: "/inventory", label: "Инвентарь", icon: Package },
  { href: "/products", label: "Продукты", icon: Archive },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Вы вышли из системы");
    },
  });

  const NavContent = () => (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
          <ChefHat className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-foreground leading-none">ШефДом</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Домашняя кухня</p>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl mb-1 cursor-pointer transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground"
              )}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{label}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* User + logout */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">
              {me?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <span className="text-sm font-medium text-foreground truncate">{me?.name ?? "Гость"}</span>
        </div>
        <button
          onClick={() => logout.mutate()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Выйти
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-card border-r border-border flex-shrink-0">
        <NavContent />
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card shadow-xl">
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-accent"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground">ШефДом</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
