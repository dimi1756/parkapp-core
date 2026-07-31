import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
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
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  municipalityName: string | null;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export const AdminSidebar = ({ activeSection, onSectionChange, municipalityName, mobileOpen, onMobileOpenChange }: SidebarProps) => {
  const { setAdminMode } = useApp();
  const { signOut } = useAuth();
  const { t } = useLanguage();

  const menuItems = [
    { id: 'overview', label: t('admin.overview'), icon: LayoutDashboard },
    { id: 'analytics', label: t('admin.analytics'), icon: BarChart3 },
    { id: 'livemap', label: t('admin.liveMap'), icon: Map },
    { id: 'settings', label: t('admin.settings'), icon: Settings },
  ];

  // Shared between the fixed desktop aside and the mobile Sheet drawer so
  // the two surfaces can never drift out of sync.
  const sidebarContent = (
    <>
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-sidebar-foreground">{municipalityName ?? t('admin.city')}</h2>
            <p className="text-xs text-muted-foreground">{t('admin.controlCenter')}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                onSectionChange(item.id);
                onMobileOpenChange(false);
              }}
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
          {t('admin.backToApp')}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          {t('admin.logOut')}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop / tablet: fixed sidebar, unchanged from the original layout */}
      <aside className="hidden md:flex w-64 shrink-0 bg-sidebar border-r border-sidebar-border h-full flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile: slide-over drawer, opened via the header hamburger button */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-64 max-w-[80vw] p-0 flex flex-col bg-sidebar border-sidebar-border">
          {sidebarContent}
        </SheetContent>
      </Sheet>
    </>
  );
};
