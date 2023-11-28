import TwitterIcon from './icons/TwitterIcon'
import DiscordIcon from './icons/DiscordIcon'
import TelegramIcon from './icons/TelegramIcon'
import Link from 'next/link'
import GithubIcon from './icons/GithubIcon'
import YoutubeIcon from './icons/YoutubeIcon'

const Footer = () => {
  return (
    <div className="before:gradient-border relative bottom-0 flex w-full flex-col  items-center justify-between gap-y-8  px-8 py-8 before:bottom-[initial] before:top-0 md:flex-row md:gap-y-0">
      <Link href="/">
        <a className="md:basis-[195px]">
          <img src="/pyth.svg" className="" />
        </a>
      </Link>
      <div className="flex items-center justify-center gap-x-5 md:w-36 md:gap-x-6">
        <a
          rel="noreferrer"
          href="https://docs.pyth.network/"
          target="_blank"
          className="text-sm   transition-all duration-200 hover:underline"
        >
          Docs
        </a>
      </div>
      <div className="flex items-center justify-center gap-x-6 text-light">
        <a
          rel="noreferrer"
          target="_blank"
          href="https://twitter.com/PythNetwork"
          className="transform  shadow-sm transition duration-500 hover:scale-125"
        >
          <TwitterIcon />
        </a>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://t.me/Pyth_Network"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <TelegramIcon />
        </a>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://github.com/pyth-network"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <GithubIcon />
        </a>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://discord.gg/pythnetwork"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <DiscordIcon />
        </a>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://www.youtube.com/channel/UCjCkvPN9ohl0UDvldfn1neg"
          className="transform text-base font-light shadow-sm transition duration-500 hover:scale-125"
        >
          <YoutubeIcon />
        </a>
      </div>
    </div>
  )
}

export default Footer
