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
    <button
      className="action-btn text-base "
      onClick={onAction}
      disabled={isActionDisabled || isActionLoading}
    >
      {isActionLoading ? (
        <Spinner />
      ) : isActionDisabled ? (
        <Tooltip content={tooltipContentOnDisabled}>{actionLabel}</Tooltip>
      ) : (
        actionLabel
      )}
    </button>
  )
}
