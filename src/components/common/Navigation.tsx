import React from 'react';
import { NavigationTab } from '../../types';
import { Home, Pill, BarChart3, Plus, Shield } from 'lucide-react';

interface NavigationProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    { id: 'today' as const, icon: Home, label: 'خانه' },
    { id: 'medications' as const, icon: Pill, label: 'دارو' },
    { id: 'interactions' as const, icon: Shield, label: 'تداخلات' },
    { id: 'reports' as const, icon: BarChart3, label: 'گزارش' }
  ];

  return (
    <div className="fixed bottom-4 left-0 right-0 z-40 px-4 sm:px-6 pointer-events-none">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3 pointer-events-auto">
        
        {/* Floating Circular Animated Action Button (Plus Icon) - Positioned on the RIGHT side in RTL */}
        <button
          onClick={() => onSelectTab('add')}
          className="group shrink-0 bg-gradient-to-tr from-teal-500 to-emerald-400 text-white rounded-full flex items-center justify-center shadow-xl shadow-teal-500/35 hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white dark:border-slate-900 relative w-14 h-14 sm:w-16 sm:h-16"
          title="افزودن داروی جدید"
        >
          {/* Pulsing ring animation — کند شده: هر ۱۰ ثانیه یک چشمک، نه پیوسته */}
          <span className="absolute inset-0 rounded-full bg-teal-400 opacity-40 animate-slow-ping group-hover:opacity-75" />
          <Plus className="w-7 h-7 stroke-[2.8] relative z-10 transition-transform duration-300 group-hover:rotate-90" />
        </button>

        {/* Main Floating Capsule Navigation Bar */}
        <nav className="flex-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-full p-2.5 sm:p-3 border border-white/60 dark:border-slate-800 shadow-2xl flex items-center justify-around transition-all">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`px-3 py-2 rounded-full flex flex-col items-center justify-center gap-0.5 relative ${
                  isActive
                    ? 'text-teal-600 dark:text-teal-400 bg-teal-50/80 dark:bg-teal-950/50 shadow-xs'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
                title={item.label}
              >
                <Icon className="w-6 h-6 stroke-[2.2]" />
                <span className="font-bold leading-none text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </nav>

      </div>
    </div>
  );
};
