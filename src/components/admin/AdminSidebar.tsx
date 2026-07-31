import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Map,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  municipalityName: string | null;
}

export const AdminSidebar = ({ activeSection, onSectionChange, municipalityName }: SidebarProps) => {
  const { setAdminMode } = useApp();
  const { signOut } = useAuth();

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'livemap', label: 'Live Map', icon: Map },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border h-screen flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-sidebar-foreground">{municipalityName ?? 'Municipality'}</h2>
            <p className="text-xs text-muted-foreground">Control Center</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setAdminMode(false)}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to App
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </Button>
      </div>
    </aside>
  );
};
