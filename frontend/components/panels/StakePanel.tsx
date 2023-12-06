import { useDepositMutation } from 'hooks/useDepositMutation'
import { StakeAccount, VestingAccountState } from '@pythnetwork/staking'
import { usePythBalance } from 'hooks/usePythBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useVestingAccountState } from 'hooks/useVestingAccountState'
import { MainStakeAccount } from 'pages'
import { useCallback, useState } from 'react'
import { validAmountChange } from 'utils/validAmountChange'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  Layout,
  AmountInputLabel,
  AmountInput,
  ActionButton,
  Description,
} from './components'
import { isSufficientBalance as isSufficientBalanceFn } from 'utils/isSufficientBalance'
import { WalletModalButton } from '@components/WalletModalButton'
import { LlcModal } from '@components/modals/LlcModal'
import toast from 'react-hot-toast'

type StakePanelProps = {
  mainStakeAccount: MainStakeAccount
}

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
    [depositMutation.mutate, mainStakeAccount, stakeConnection]
  )

  const [isLlcModalOpen, setIsLlcModalOpen] = useState(false)

  // This only executes if deposit action is enabled
  const onAction = useCallback(async () => {
    if (mainStakeAccount === 'NA') setIsLlcModalOpen(true)
    else {
      try {
        const isLlcMember = await stakeConnection!.isLlcMember(
          mainStakeAccount!
        )

        if (isLlcMember === true) deposit(amount)
        else setIsLlcModalOpen(true)
      } catch {
        toast.error('Connection error')
      }
    }
  }, [deposit, amount, stakeConnection, mainStakeAccount])

  const isSufficientBalance = isSufficientBalanceFn(amount, pythBalance)

  // set amount when input changes
  const handleAmountChange = (amount: string) => {
    if (validAmountChange(amount)) setAmount(amount)
  }

  return (
    <>
      <Layout>
        <Description>
          Deposit and stake PYTH. Staking tokens enables you to participate in
          Pyth Network governance. Newly-staked tokens become eligible to vote
          in governance at the beginning of the next epoch. (Epochs start every
          Thursday at 00:00 UTC and last 7 days).
        </Description>
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
            <WalletModalButton />
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
        <LlcModal
          isLlcModalOpen={isLlcModalOpen}
          setIsLlcModalOpen={setIsLlcModalOpen}
          onSignLlc={() => {
            // Once the user clicks sign llc agreement
            // Sign and deposit will happen in the same transaction
            // We are handling the loading in the panel itself.
            deposit(amount)
            setIsLlcModalOpen(false)
          }}
        />
      </Layout>
    </>
  )
}
