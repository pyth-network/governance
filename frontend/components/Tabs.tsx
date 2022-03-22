import { FC } from 'react'

interface TabsProps {
  activeTab: string
  onChange: (x) => void
  tabs: Array<string>
}

const Tabs: FC<TabsProps> = ({ activeTab, onChange, tabs }) => {
  return (
    <div className={`border-fgd-4 relative mb-4 border-b`}>
      <div
        className={`bg-mediumSlateBlue default-transition absolute bottom-[-1px] left-0 h-0.5`}
        style={{
          maxWidth: '176px',
          transform: `translateX(${
            tabs.findIndex((v) => v === activeTab) * 100
          }%)`,
          width: `${100 / tabs.length}%`,
        }}
      />
      <nav className="-mb-px flex" aria-label="Tabs">
        {tabs.map((tabName) => {
          return (
            <a
              key={tabName}
              onClick={() => onChange(tabName)}
              className={`default-transition relative flex cursor-pointer justify-center whitespace-nowrap pb-3 text-sm font-bold hover:opacity-100
                    ${
                      activeTab === tabName
                        ? `text-mediumSlateBlue`
                        : `text-fgd-3 hover:text-primary-light`
                    }
                  `}
              style={{ width: `${100 / tabs.length}%`, maxWidth: '176px' }}
            >
              {tabName}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

export default Tabs
