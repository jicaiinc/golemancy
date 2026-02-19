import { GlobalLayout } from '../../app/layouts/GlobalLayout'

export function GlobalDashboardPage() {
  return (
    <GlobalLayout>
      <div className="max-w-[1200px] mx-auto p-8">
        <h2 className="font-pixel text-[12px] text-text-primary mb-8">Dashboard</h2>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="font-pixel text-[20px] text-text-dim mb-4">[:::]</div>
            <p className="text-[12px] text-text-dim mt-2">Coming soon...</p>
          </div>
        </div>
      </div>
    </GlobalLayout>
  )
}
