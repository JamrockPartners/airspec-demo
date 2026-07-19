import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileBarChart, Database } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/datasets', label: 'Datasets', icon: Database },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-slate-900 flex flex-col z-40">
      <div className="px-5 py-6 border-b border-slate-700/50">
        <h1 className="text-white text-lg font-semibold tracking-tight">AIRspec</h1>
        <p className="text-slate-400 text-xs mt-0.5">Baseline Template</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-slate-700/50">
        <p className="text-slate-500 text-xs">v0.1.0</p>
      </div>
    </aside>
  );
}
