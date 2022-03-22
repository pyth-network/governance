import React from 'react'
import { GlobeAltIcon } from '@heroicons/react/outline'
import { BadgeCheckIcon } from '@heroicons/react/solid'
import Tooltip from './Tooltip'
import TwitterIcon from './TwitterIcon'

const RealmHeader = () => {
  return (
    <div className="flex rounded-t-lg bg-valhalla px-4 pb-4 pt-4 md:px-6 md:pt-6">
      <div className="flex flex-col items-center md:flex-row  md:justify-between">
        <div className="flex items-center">
          <div className="flex flex-col items-center pb-3 md:flex-row md:pb-0">
            <img
              className="mb-2 w-8 flex-shrink-0 md:mb-0"
              src="/pyth-logo-white.svg"
            />
            <div className="flex items-center">
              <h1 className="ml-3">Pyth Governance</h1>
              <Tooltip content="Certified DAO">
                <BadgeCheckIcon className="ml-1.5 h-5 w-5 cursor-help text-green" />
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center space-x-6">
        <a
          className="default-transition flex items-center text-sm text-fullWhite hover:text-pink"
          href="https://pyth.network/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GlobeAltIcon className="mr-1.5 h-4 w-4 text-melrose" />
          Website
        </a>
        <a
          className="default-transition flex items-center text-sm text-fullWhite hover:text-pink"
          href="https://twitter.com/PythNetwork"
          target="_blank"
          rel="noopener noreferrer"
        >
          <TwitterIcon className="mr-1.5 h-4 w-4 text-melrose" />
          Twitter
        </a>
      </div>
    </div>
  )
}

export default RealmHeader
