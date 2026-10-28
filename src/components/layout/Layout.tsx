import React from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { RibbonSlotProvider } from './Ribbon';
import { ToastContainer } from '../common/Toast';
import { useAppStore } from '../../stores/appStore';

// Routes that need to fill the full available space with no padding/scroll
const FULL_PAGE_ROUTES = ['/builder'];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isLoading, isAnimationFullscreen } = useAppStore();
  const location = useLocation();
  const isFullPage = FULL_PAGE_ROUTES.includes(location.pathname);
  const mainRef = React.useRef<HTMLElement>(null);
  // Each page starts at the top (the shared <main> otherwise keeps the
  // previous page's scroll offset).
  React.useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [location.pathname]);

  if (isAnimationFullscreen) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--page-bg)' }}>
        <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
        <ToastContainer />
      </div>
    );
  }

  // Engineering-desktop shell: title bar + ribbon on top, page in the middle,
  // status bar at the bottom. (The dark sidebar was replaced by ribbon tabs.)
  return (
    <RibbonSlotProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--page-bg)' }}>
        <Header />
        <main ref={mainRef} style={{ flex: 1, minHeight: 0, overflow: isFullPage ? 'hidden' : 'auto', padding: isFullPage ? 0 : 12, display: isFullPage ? 'flex' : undefined, flexDirection: isFullPage ? 'column' : undefined }}>
          {isLoading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: 24, height: 24 }} />
            </div>
          ) : (
            children
          )}
        </main>
        <StatusBar />
        <ToastContainer />
      </div>
    </RibbonSlotProvider>
  );
}
