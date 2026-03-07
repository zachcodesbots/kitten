import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Image, Briefcase, Play, Settings, LogOut, Cat
} from 'lucide-react';

const navItems = [
  { to: '/buckets', label: 'Buckets', icon: Image },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/runs', label: 'Runs', icon: Play },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-surface-200 bg-white flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-surface-100">
          <Cat className="w-6 h-6 text-brand-600" />
          <span className="font-semibold text-lg tracking-tight">Kitten</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-surface-100 px-3 py-3">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-surface-500 truncate">{user?.username}</span>
            <button onClick={handleLogout} className="text-surface-400 hover:text-surface-600 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
