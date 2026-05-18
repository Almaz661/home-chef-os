import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, BookOpen, Calendar, ShoppingCart, Package, LogOut, ChefHat } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  userName: string;
  onLogout: () => void;
}

const navItems = [
  { path: '/', label: 'Главная', icon: Home },
  { path: '/recipes', label: 'Рецепты', icon: BookOpen },
  { path: '/menu', label: 'Меню', icon: Calendar },
  { path: '/shopping', label: 'Покупки', icon: ShoppingCart },
  { path: '/inventory', label: 'Инвентарь', icon: Package },
];

export default function Layout({ children, userName, onLogout }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[var(--color-kitchen-bg)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--color-kitchen-border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <ChefHat className="w-8 h-8 text-primary-600" />
              <span className="text-xl font-bold text-primary-800">ШефДом</span>
            </Link>
            
            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-primary-100 text-primary-700' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 hidden sm:block">{userName}</span>
              <button
                onClick={onLogout}
                className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                title="Выйти"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--color-kitchen-border)] z-50 safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[60px] ${
                  isActive ? 'text-primary-600' : 'text-gray-500'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
