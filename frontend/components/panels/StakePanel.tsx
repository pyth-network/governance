import {
  ActionButton,
  AmountInput,
  AmountInputLabel,
  PanelDescription,
  PanelLayout,
} from './BasePanel'
import { useDepositMutation } from 'hooks/useDepositMutation'
import {
  PythBalance,
  StakeAccount,
  VestingAccountState,
} from '@pythnetwork/staking'
import { usePythBalance } from 'hooks/usePythBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useVestingAccountState } from 'hooks/useVestingAccountState'
import { MainStakeAccount } from 'pages'
import { useCallback, useMemo, useState } from 'react'
import { validAmountChange } from 'utils/validAmountChange'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import { LLCModal } from '@components/modals/LLCModal'

type StakePanelProps = {
  mainStakeAccount: MainStakeAccount
}

const Description =
  'Deposit and stake PYTH. Staking tokens enables you to participate in Pyth Network governance. Newly-staked tokens become eligible to vote in governance at the beginning of the next epoch. (Epochs start every Thursday at 00:00 UTC).'

export function StakePanel({ mainStakeAccount }: StakePanelProps) {
  const { connected } = useWallet()

  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const depositMutation = useDepositMutation()
  const { data: stakeConnection, isLoading: isStakeConnectionLoading } =
    useStakeConnection()
  const { data: pythBalance, isLoading: isPythBalanceLoading } =
    usePythBalance()

  const { data: vestingAccountState } = useVestingAccountState(mainStakeAccount)

  const accountWithLockedTokens =
    vestingAccountState !== undefined &&
    vestingAccountState != VestingAccountState.FullyVested &&
    vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked

  const [amount, setAmount] = useState<string>('')

  const deposit = useCallback(
    (amount: string) =>
      // we are disabling actions when mainStakeAccount is undefined
      // or stakeConnection is undefined
      depositMutation.mutate({
        amount,
        // If mainStakeAccount is undefined this action is disabled
        // undefined means that the mainStakeAccount is loading.
        // If we execute this action, this will work. But it will create a
        // new stake account for the user.
        mainStakeAccount: mainStakeAccount as StakeAccount | 'NA',
        // action is disabled below if these is undefined
        stakeConnection: stakeConnection!,
      }),
    []
  )

  // This only executes if deposit action is enabled
  const onAction = useCallback(async () => {
    if (
      mainStakeAccount === 'NA' ||
      (await stakeConnection!.isLlcMember(mainStakeAccount!)) === false
    )
      setIsLLCModalOpen(true)
    else deposit(amount)
  }, [deposit, amount, stakeConnection, mainStakeAccount])

  const [isLLCModalOpen, setIsLLCModalOpen] = useState(false)

  const isSufficientBalance = useMemo(() => {
    if (amount && pythBalance) {
      if (PythBalance.fromString(amount).gt(pythBalance)) {
        return false
      } else {
        return true
      }
    } else {
      return true
    }
  }, [amount, pythBalance])

  // set amount when input changes
  const handleAmountChange = (amount: string) => {
    if (validAmountChange(amount)) setAmount(amount)
  }

  return (
    <>
      <PanelLayout>
        <PanelDescription>{Description}</PanelDescription>
        {connected && (
          <>
            <AmountInputLabel
              balance={pythBalance}
              isBalanceLoading={
                isStakeConnectionLoading || isPythBalanceLoading
              }
              setAmount={setAmount}
            />
            <AmountInput amount={amount} onAmountChange={handleAmountChange} />
          </>
        )}

        <div className="flex items-center justify-center ">
          {!connected ? (
            <WalletModalButton
              style={{
                padding: '0 64px',
                border: 'solid',
                borderWidth: '1px',
                borderColor: 'rgb(113 66 207)',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
                background: 'rgb(113 66 207)',
                height: '45px',
              }}
            />
          ) : (
            <ActionButton
              actionLabel={'Stake'}
              onAction={onAction}
              isActionDisabled={
                !isSufficientBalance ||
                // if mainStakeAccount is undefined, the action should be disabled
                mainStakeAccount === undefined ||
                stakeConnection === undefined ||
                accountWithLockedTokens
              }
              isActionLoading={depositMutation.isLoading}
              tooltipContentOnDisabled={
                !isSufficientBalance
                  ? 'Insufficient Balance'
                  : accountWithLockedTokens
                  ? 'You are currently not enrolled in governance.'
                  : undefined
              }
            />
          )}
        </div>
      </PanelLayout>
      <LLCModal
        isLLCModalOpen={isLLCModalOpen}
        setIsLLCModalOpen={setIsLLCModalOpen}
        onSignLLC={() => deposit(amount)}
      />
    </>
  )
}
