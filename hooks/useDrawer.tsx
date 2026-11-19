import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type DrawerTab = 'history' | 'favorites';

interface DrawerContextType {
  isOpen: boolean;
  activeTab: DrawerTab;
  openDrawer: (tab?: DrawerTab) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setActiveTab: (tab: DrawerTab) => void;
}

const DrawerContext = createContext<DrawerContextType | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('history');

  const openDrawer = useCallback((tab?: DrawerTab) => {
    if (tab) setActiveTab(tab);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleDrawer = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <DrawerContext.Provider
      value={{ isOpen, activeTab, openDrawer, closeDrawer, toggleDrawer, setActiveTab }}
    >
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within DrawerProvider');
  return ctx;
}
