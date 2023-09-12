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
      maxWidth="15rem"
      interactive
      content={
        <div
          className={`rounded border border-darkGray3 bg-darkGray p-3 text-xs leading-snug text-lavenderGray shadow-md ${className}`}
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
