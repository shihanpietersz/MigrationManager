'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

/**
 * Pill-style tab group component
 * Matches the "By Wave | By Application | By Server" style from the design
 */
export function TabGroup({ tabs, activeTab, onTabChange, className }: TabGroupProps) {
  return (
    <div className={cn('inline-flex bg-muted p-1 rounded-lg', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200',
            activeTab === tab.id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Simple tab list without background container
 * For use cases where you want underline-style tabs
 */
export interface UnderlineTabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function UnderlineTabGroup({
  tabs,
  activeTab,
  onTabChange,
  className,
}: UnderlineTabGroupProps) {
  return (
    <div className={cn('flex border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px',
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Tab panel container
 * Use with TabGroup to show/hide content based on active tab
 */
export interface TabPanelProps {
  tabId: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ tabId, activeTab, children, className }: TabPanelProps) {
  if (tabId !== activeTab) return null;

  return (
    <div className={cn('animate-in fade-in-0 duration-200', className)}>
      {children}
    </div>
  );
}

/**
 * Hook for managing tab state
 */
export function useTabs(defaultTab: string) {
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  return { activeTab, setActiveTab };
}
