import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: 'Today', end: true },
  { to: '/review', label: 'Review' },
  { to: '/library', label: 'Library' },
  { to: '/settings', label: 'Settings' },
]

export function Shell() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <nav className="mx-auto flex max-w-4xl items-center gap-1 px-4 py-3">
          <span className="hanzi mr-3 shrink-0 whitespace-nowrap text-lg" style={{ color: 'var(--accent)' }}>
            中文
          </span>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className="rounded-md px-3 py-1.5 text-sm"
              style={({ isActive }) => ({
                background: isActive ? 'var(--surface-2)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-dim)',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
