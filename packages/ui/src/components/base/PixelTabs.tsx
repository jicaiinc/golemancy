import { type ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
}

interface PixelTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function PixelTabs({ tabs, activeTab, onTabChange }: PixelTabsProps) {
  return (
    <div className="flex border-b-2 border-border-dim">
      {tabs.map(tab => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 font-mono text-[12px] cursor-pointer transition-colors border-b-2 -mb-[2px] ${
              isActive
                ? 'bg-surface text-text-primary border-b-surface'
                : 'bg-deep text-text-secondary border-b-border-dim hover:text-text-primary hover:bg-elevated/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
