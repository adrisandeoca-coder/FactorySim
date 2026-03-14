import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../common/Toast';
import { useAppStore } from '../../stores/appStore';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { sidebarOpen, isLoading, isAnimationFullscreen } = useAppStore();

  if (isAnimationFullscreen) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && <Sidebar />}

        <main className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="spinner w-8 h-8" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
