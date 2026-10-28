import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  builder: 'Factory Builder',
  scenarios: 'Scenarios',
  orders: 'Orders',
  code: 'Code Editor',
  data: 'Data Sync',
  sweep: 'Parameter Sweep',
  plugins: 'Plugins',
  settings: 'Settings',
};

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  // Breadcrumb is now shown in the Header topbar — no duplicate needed in content area
  if (true) return null;

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm text-gray-500 mb-4">
      <Link to="/dashboard" className="hover:text-gray-700">
        Home
      </Link>
      {segments.map((segment, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/');
        const label = ROUTE_LABELS[segment] || segment;
        const isLast = i === segments.length - 1;

        return (
          <span key={path} className="flex items-center">
            <ChevronRight className="w-4 h-4 mx-1" />
            {isLast ? (
              <span className="text-gray-900 font-medium" aria-current="page">{label}</span>
            ) : (
              <Link to={path} className="hover:text-gray-700">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
