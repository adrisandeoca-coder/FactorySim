import { NavLink } from 'react-router-dom';
import { useModelStore } from '../../stores/modelStore';
import { useSimulationStore } from '../../stores/simulationStore';
import {
  LayoutDashboard,
  Puzzle,
  BarChart3,
  ClipboardList,
  Code2,
  Database,
  TrendingUp,
  Zap,
  Settings,
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/builder', label: 'Factory Builder', icon: Puzzle },
  { path: '/scenarios', label: 'Scenarios', icon: BarChart3 },
  { path: '/orders', label: 'Orders', icon: ClipboardList },
  { path: '/code', label: 'Code Editor', icon: Code2 },
  { path: '/data', label: 'Data Sync', icon: Database },
  { path: '/sweep', label: 'Param Sweep', icon: TrendingUp },
  { path: '/plugins', label: 'Plugins', icon: Zap },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { model } = useModelStore();
  const { scenarios } = useSimulationStore();

  return (
    <aside className="sidebar">
      <nav className="flex-1 py-2 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <item.icon className="w-4 h-4 mr-2.5" strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mb-2 rounded-md p-3" style={{ backgroundColor: 'var(--sidebar-surface)' }}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sidebar-text-muted)' }}>
          Model
        </h3>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between" style={{ color: 'var(--sidebar-text-muted)' }}>
            <span>Stations</span>
            <span className="font-mono tabular-nums font-medium" style={{ color: 'var(--sidebar-text)' }}>{model.stations.length}</span>
          </div>
          <div className="flex justify-between" style={{ color: 'var(--sidebar-text-muted)' }}>
            <span>Buffers</span>
            <span className="font-mono tabular-nums font-medium" style={{ color: 'var(--sidebar-text)' }}>{model.buffers.length}</span>
          </div>
          <div className="flex justify-between" style={{ color: 'var(--sidebar-text-muted)' }}>
            <span>Products</span>
            <span className="font-mono tabular-nums font-medium" style={{ color: 'var(--sidebar-text)' }}>{model.products.length}</span>
          </div>
          <div className="flex justify-between" style={{ color: 'var(--sidebar-text-muted)' }}>
            <span>Scenarios</span>
            <span className="font-mono tabular-nums font-medium" style={{ color: 'var(--sidebar-text)' }}>{scenarios.length}</span>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 text-[10px] font-mono" style={{ borderTop: '1px solid var(--sidebar-border)', color: 'var(--sidebar-text-muted)' }}>
        FactorySim v1.0.0
      </div>
    </aside>
  );
}
