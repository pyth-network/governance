import Spinner from '@components/Spinner'
import Tooltip from '@components/Tooltip'

export type ActionButtonProps = {
  actionLabel: string
  onAction: () => void
  isActionDisabled: boolean | undefined
  isActionLoading: boolean | undefined
  tooltipContentOnDisabled?: string
}
export function ActionButton({
  actionLabel,
  onAction,
  isActionDisabled,
  isActionLoading,
  tooltipContentOnDisabled,
}: ActionButtonProps) {
  return (
    <Tooltip content={tooltipContentOnDisabled}>
      <button
        className="btn btn--light"
        onClick={onAction}
        disabled={isActionDisabled || isActionLoading}
      >
        <span className="relative inline-flex items-center whitespace-nowrap">
          {isActionLoading ? <Spinner /> : actionLabel}
        </span>
      </button>
    </Tooltip>
  )
}
