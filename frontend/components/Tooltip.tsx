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
          className={`rounded border-2 border-darkSlateBlue bg-darkerPurpleBackground p-3 text-xs  text-lavenderGray shadow-md  ${className}`}
        >
          {content}
        </div>
      }
    >
      <div className={`${contentClassName}`}>{children}</div>
    </Tippy>
  ) : (
    <>{children}</>
  )
}

const Content: React.FC<{ className: string }> = ({
  className = '',
  children,
}) => {
  return <div>{children}</div>
}

Tooltip.Content = Content

export default Tooltip
