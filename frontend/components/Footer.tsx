import TwitterIcon from './icons/TwitterIcon'
import DiscordIcon from './icons/DiscordIcon'
import SiteIcon from './icons/SiteIcon'

const Footer = () => {
  return (
    <div className="bottom-0 flex w-full flex-row justify-between gap-y-8 border-t border-mediumSlateBlue bg-jaguar px-8 py-8 md:gap-y-0">
      <div className="flex items-center gap-x-5 md:w-36 md:gap-x-6">
        <a
          rel="noreferrer"
          href="https://docs.pyth.network/"
          target="_blank"
          className="text-base font-bold text-white transition-all duration-200 hover:text-pink"
        >
          Docs
        </a>
      </div>
      <div className="flex items-center justify-center gap-x-10 sm:gap-x-20 md:gap-x-24">
        <a
          rel="noreferrer"
          target="_blank"
          href="https://pyth.network/"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <SiteIcon />
        </a>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://twitter.com/PythNetwork"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <TwitterIcon />
        </a>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://discord.gg/pythnetwork"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <DiscordIcon />
        </a>
      </div>
      <div className="hidden items-center justify-center gap-x-1 md:w-36 md:flex "></div>
    </div>
  )
}

export default Footer
