import { useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

/**
 * Sync active tab state with `?tab=` URL search param.
 * When the tab is the default, the param is removed to keep URLs clean.
 */
export function useTabParam(
  validTabs: readonly string[],
  defaultTab?: string,
): [string, (tab: string) => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const fallback = defaultTab ?? validTabs[0]
  const tabFromUrl = searchParams.get('tab')
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : fallback

  const [activeTab, setActiveTabState] = useState(initialTab)

  // React to external URL changes (e.g. browser back/forward)
  useEffect(() => {
    setActiveTabState(initialTab)
  }, [initialTab])

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab)

    const next = new URLSearchParams(searchParams)
    if (tab === fallback) {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    const search = next.toString()

    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '' },
      { replace: true, state: location.state },
    )
  }, [fallback, location.pathname, location.state, navigate, searchParams])

  return [activeTab, setActiveTab]
}
