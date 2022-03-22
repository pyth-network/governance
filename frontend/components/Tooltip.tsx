import React, { ReactNode } from 'react'
import Tippy from '@tippyjs/react'
import 'tippy.js/animations/scale.css'

type TooltipProps = {
  content: ReactNode
  placement?: any
  className?: string
  children?: ReactNode
  contentClassName?: string
}

const Tooltip = ({
  children,
  content,
  className,
  contentClassName,
  placement = 'top',
}: TooltipProps) => {
  return content ? (
    <Tippy
      animation="scale"
      placement={placement}
      appendTo={() => document.body}
      maxWidth="20rem"
      interactive
      content={
        <div
          className={`bg-bkg-1 text-fgd-3 rounded p-3 text-xs leading-5 shadow-md outline-none focus:outline-none ${className}`}
        >
          {content}
        </div>
      }
    >
      <div className={`outline-none focus:outline-none ${contentClassName}`}>
        {children}
      </div>
    </Tippy>
  ) : (
    <>{children}</>
  )
}

const Content = ({ className = '', children }) => {
  return (
    <div
      className={`border-fgd-3 default-transition hover:border-bkg-2 inline-block cursor-help border-b border-dashed border-opacity-20 ${className}`}
    >
      {children}
    </div>
  )
}

Tooltip.Content = Content

export default Tooltip
