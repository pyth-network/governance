import type { NextPage } from 'next'
import { makeStyles } from '@mui/styles'
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  FormControl,
  Grid,
  InputLabel,
  Input,
  Theme,
  TableContainer,
  Table,
  TableCell,
  TableHead,
  TableRow,
  TableBody,
  tableCellClasses,
  Tab,
  Tabs,
  Typography,
  Chip,
  Hidden,
  Divider,
} from '@mui/material'
import Layout from '../components/Layout'
import { colors } from '@components/muiTheme'
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { WalletDialogButton } from '@solana/wallet-adapter-material-ui'
import { ChangeEvent, useEffect, useState } from 'react'
import { useSnackbar } from 'notistack'
import { getPythTokenBalance } from './api/getPythTokenBalance'
import { STAKING_PROGRAM } from '@components/constants'
import { Wallet, Provider, getProvider } from '@project-serum/anchor'
import {
  StakeAccount,
  StakeConnection,
} from '../../staking-ts/src/StakeConnection'
import { getLockedPythTokenBalance } from './api/getLockedPythTokenBalance'
import { getUnlockedPythTokenBalance } from './api/getUnlockedPythTokenBalance'
import { airdropPythToken } from './api/airdropPythToken'
import Image from 'next/image'

const useStyles = makeStyles((theme: Theme) => ({
  sectionContainer: {
    paddingTop: 127,
    paddingBottom: 127,
  },
  card: {
    backgroundColor: theme.palette.primary.main,
    maxWidth: 600,
    margin: 'auto',
  },
  cardBlack: {
    marginTop: 30,
    maxWidth: 600,
    margin: 'auto',
  },
  form: {
    '& .MuiFormControl-root': { marginBottom: 30 },
  },
  amountInputLabel: {
    display: 'flex',
    alignItems: 'center',
    '& .MuiInputLabel-root': {
      color: 'white',
      '&.Mui-focused': {
        color: colors.white,
      },
    },
  },
  amountInput: {
    '& .MuiInput-input': {
      border: `1px solid ${colors.lightGreyLines}`,
      borderRadius: 100,
      marginTop: 15,
      padding: 15,
      backgroundColor: '#835FCC',
    },
    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
      '-webkit-appearance': 'none',
      margin: 0,
    },
    '& .MuiInput-underline:focus': {
      borderBottomColor: colors.white,
    },
  },
  button: {
    paddingTop: 10,
    paddingBottom: 10,
    borderColor: colors.white,
    color: colors.white,
    '&:hover': {
      backgroundColor: colors.white,
      color: colors.headlineText,
    },
    '&:active': {
      backgroundColor: colors.lightPurple,
      borderColor: colors.lightPurple,
      color: colors.headlineText,
    },
  },
  buttonGroup: {
    display: 'flex',
    [theme.breakpoints.down('xs')]: {
      display: 'block',
    },
  },
  tabs: {
    '& .MuiTabs-indicator': {
      display: 'flex',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    '& .MuiTabs-indicatorSpan': {
      maxWidth: 40,
      width: '100%',
      backgroundColor: colors.lightPurple,
    },
    marginBottom: 15,
  },
  tab: {
    textTransform: 'none',
    fontWeight: theme.typography.fontWeightRegular,
    fontSize: theme.typography.pxToRem(15),
    marginRight: theme.spacing(1),
    color: 'rgba(255, 255, 255, 0.7)',
    '&.Mui-selected': {
      color: '#fff',
    },
    '&.Mui-focusVisible': {
      backgroundColor: 'rgba(100, 95, 228, 0.32)',
    },
  },
  amountBalanceGroup: {
    display: 'flex',
  },
  balanceGroup: {
    display: 'flex',
    columnGap: '7px',
    marginLeft: 'auto',
    marginRight: 0,
    alignItems: 'center',
    '& .MuiTypography-root': {
      fontSize: '14px',
    },
    '& .MuiChip-root': {
      border: `1px solid ${colors.lightPurple}`,
      backgroundColor: '#835FCC',
    },
  },
  tokenLogoGroup: {
    display: 'flex',
    textAlign: 'center',
    justifyContent: 'center',
  },
}))

const Staking: NextPage = () => {
  const classes = useStyles()
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const hello = useWallet()
  const { publicKey, connected, connecting } = useWallet()
  const { enqueueSnackbar } = useSnackbar()
  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccount, setStakeAccount] = useState<StakeAccount>()
  const [balance, setBalance] = useState<number>(0)
  const [pythBalance, setPythBalance] = useState<number>(0)
  const [lockedPythBalance, setLockedPythBalance] = useState<number>(0)
  const [unlockedPythBalance, setUnlockedPythBalance] = useState<number>(0)
  const [unvestedPythBalance, setUnvestedPythBalance] = useState<number>(0)
  const [amount, setAmount] = useState<number>(0)
  const [currentTab, setCurrentTab] = useState<string>('Deposit')

  // create stake connection when wallet is connected
  useEffect(() => {
    const createStakeConnection = async () => {
      const sc = await StakeConnection.createStakeConnection(
        connection,
        anchorWallet as Wallet,
        STAKING_PROGRAM
      )
      setStakeConnection(sc)
    }
    if (!connected) {
      setStakeConnection(undefined)
      setStakeAccount(undefined)
    } else {
      console.log('creating stake connection...')
      createStakeConnection()
      console.log('stake connection created')
    }
  }, [connected])

  // get stake accounts when stake connection is set
  useEffect(() => {
    if (stakeConnection && publicKey) {
      stakeConnection
        ?.getStakeAccounts(publicKey)
        .then((sa) => {
          if (sa.length > 0) {
            setStakeAccount(sa[0])
            setLockedPythBalance(sa[0].token_balance.toString())
            console.log(sa[0])
          }
        })
        .then(() => {
          refreshBalance()
        })
    }
  }, [stakeConnection])

  // set ui balance amount whenever current tab changes
  useEffect(() => {
    if (connected) {
      switch (currentTab) {
        case 'Deposit':
          setBalance(pythBalance)
          break
        case 'Unlock':
          setBalance(lockedPythBalance)
          break
        case 'Withdraw':
          setBalance(unlockedPythBalance)
          break
      }
    } else {
      setBalance(0)
    }
  }, [
    currentTab,
    connected,
    pythBalance,
    lockedPythBalance,
    unlockedPythBalance,
  ])

  // set amount when input changes
  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(parseFloat(event.target.value))
  }

  //handler
  const handleDeposit = async () => {
    if (stakeConnection && publicKey) {
      try {
        await stakeConnection.depositAndLockTokens(stakeAccount, amount)
        enqueueSnackbar('deposit successful', { variant: 'success' })
      } catch (e) {
        enqueueSnackbar(e.message, {
          variant: 'error',
        })
      }
      await refreshBalance()
    }
  }

  const handleClaimPyth = async () => {
    if (publicKey) {
      const provider = new Provider(connection, anchorWallet as Wallet, {})
      try {
        await airdropPythToken(provider, publicKey)
        enqueueSnackbar('airdrop successful', { variant: 'success' })
      } catch (e) {
        enqueueSnackbar(e.message, {
          variant: 'error',
        })
      }
    }
    await refreshBalance()
  }

  const refreshBalance = async () => {
    if (stakeConnection && publicKey) {
      setPythBalance(await getPythTokenBalance(connection, publicKey))
      setLockedPythBalance(
        await getLockedPythTokenBalance(stakeConnection, publicKey)
      )
      setUnlockedPythBalance(
        await getUnlockedPythTokenBalance(stakeConnection, publicKey)
      )
    }
  }

  const handleChangeTab = (event: React.SyntheticEvent, newValue: string) => {
    setCurrentTab(newValue)
  }

  const handleHalfBalanceClick = () => {
    setAmount(balance / 2)
  }

  const handleMaxBalanceClick = () => {
    setAmount(balance)
  }

  useEffect(() => {
    console.log(`Current Amount: ${amount}`)
  }, [amount])

  return (
    <Layout>
      <Container className={classes.sectionContainer}>
        <Grid container justifyContent="center">
          <Grid item xs={12}>
            <Card className={classes.card}>
              <CardContent>
                <Tabs
                  value={currentTab}
                  onChange={handleChangeTab}
                  className={classes.tabs}
                  TabIndicatorProps={{
                    children: <span className="MuiTabs-indicatorSpan" />,
                  }}
                  centered
                >
                  <Tab
                    className={classes.tab}
                    value="Deposit"
                    label="Deposit"
                    disableRipple
                  />
                  <Tab
                    className={classes.tab}
                    value="Unlock"
                    label="Unlock"
                    disableRipple
                  />
                  <Tab
                    className={classes.tab}
                    value="Withdraw"
                    label="Withdraw"
                    disableRipple
                  />
                </Tabs>
                <Box
                  component="form"
                  noValidate
                  autoComplete="off"
                  className={classes.form}
                >
                  <FormControl fullWidth variant="standard">
                    <div className={classes.amountBalanceGroup}>
                      <div className={classes.amountInputLabel}>
                        <Typography variant="body2">Amount (PYTH)</Typography>
                      </div>
                      {/* <Hidden mdDown implementation="css"> */}
                      <div className={classes.balanceGroup}>
                        <Typography variant="body2">
                          Balance: {balance}
                        </Typography>
                        <div style={{ flex: 1 }} />
                        <Chip
                          label="Half"
                          variant="outlined"
                          size="small"
                          onClick={handleHalfBalanceClick}
                        />
                        <Chip
                          label="Max"
                          variant="outlined"
                          size="small"
                          onClick={handleMaxBalanceClick}
                        />
                      </div>
                      {/* </Hidden> */}
                    </div>
                    <Input
                      disableUnderline={true}
                      id="amount-pyth-lock"
                      type="number"
                      className={classes.amountInput}
                      onChange={handleAmountChange}
                      value={amount?.toString()}
                    />
                  </FormControl>
                </Box>
                <Grid container spacing={1} justifyContent="center">
                  <div className={classes.buttonGroup}>
                    {connected ? (
                      <Grid item xs={12}>
                        {pythBalance === 0 ? (
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                            onClick={handleClaimPyth}
                          >
                            Claim $PYTH
                          </Button>
                        ) : currentTab === 'Deposit' ? (
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                            onClick={handleDeposit}
                          >
                            Deposit
                          </Button>
                        ) : currentTab === 'Unlock' ? (
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                          >
                            Unlock
                          </Button>
                        ) : (
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                          >
                            Withdraw
                          </Button>
                        )}
                      </Grid>
                    ) : (
                      <Grid item xs={12}>
                        <WalletDialogButton
                          variant="outlined"
                          disableRipple
                          className={classes.button}
                          disabled={connecting}
                        >
                          Connect Wallet
                        </WalletDialogButton>
                      </Grid>
                    )}
                  </div>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Grid container justifyContent="center">
          <Grid item xs={12}>
            <Card className={classes.cardBlack}>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography
                      variant="subtitle1"
                      sx={{ color: '#9CA3AF', marginBottom: 1 }}
                      align="center"
                    >
                      Unlocked
                    </Typography>
                    <div className={classes.tokenLogoGroup}>
                      <Typography variant="subtitle1">
                        {' '}
                        {connected ? unlockedPythBalance : '-'}
                      </Typography>
                      <div style={{ flex: 0.1 }} />
                      <Image
                        src="/images/pyth-coin-logo.svg"
                        alt="Pyth logo"
                        height={25}
                        width={25}
                      />
                    </div>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography
                      variant="subtitle1"
                      sx={{ color: '#9CA3AF', marginBottom: 1 }}
                      align="center"
                    >
                      Locked
                    </Typography>
                    <div className={classes.tokenLogoGroup}>
                      <Typography variant="subtitle1">
                        {' '}
                        {connected ? lockedPythBalance : '-'}
                      </Typography>
                      <div style={{ flex: 0.1 }} />
                      <Image
                        src="/images/pyth-coin-logo.svg"
                        alt="Pyth logo"
                        height={25}
                        width={25}
                      />
                    </div>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography
                      variant="subtitle1"
                      sx={{ color: '#9CA3AF', marginBottom: 1 }}
                      align="center"
                    >
                      Unvested
                    </Typography>
                    <div className={classes.tokenLogoGroup}>
                      <Typography variant="subtitle1">
                        {' '}
                        {connected ? unvestedPythBalance : '-'}
                      </Typography>
                      <div style={{ flex: 0.1 }} />
                      <Image
                        src="/images/pyth-coin-logo.svg"
                        alt="Pyth logo"
                        height={25}
                        width={25}
                      />
                    </div>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Layout>
  )
}

export default Staking
