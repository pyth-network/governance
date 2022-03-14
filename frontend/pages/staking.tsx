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
} from '@mui/material'
import Layout from '../components/Layout'
import { colors } from '@components/muiTheme'
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { ChangeEvent, useEffect, useState } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-material-ui'
import { useSnackbar } from 'notistack'
import { getStakeAccounts } from './api/getStakeAccounts'
import { createStakeAccount } from './api/createStakeAccount'
import { getPythTokenBalance } from './api/getPythTokenBalance'
import { depositTokens } from './api/depositTokens'

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
    maxWidth: 600,
    margin: 'auto',
  },
  form: {
    '& .MuiFormControl-root': { marginBottom: 30 },
  },
  amountInputLabel: {
    marginTop: 6,
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
}))

const tokens = { Unlocked: 10000, Locked: 100, Unvested: 1000 }

const Staking: NextPage = () => {
  const classes = useStyles()
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { publicKey, connected } = useWallet()
  const { enqueueSnackbar } = useSnackbar()
  const [stakeAccountExists, setStakeAccountExists] = useState<boolean>(false)
  const [pythBalance, setPythBalance] = useState<number>(0)
  const [lockedPythBalance, setLockedPythBalance] = useState<Number>(0)
  const [amount, setAmount] = useState<number>(0)
  const [currentTab, setCurrentTab] = useState<string>('Deposit')

  useEffect(() => {
    if (!connected) {
      setStakeAccountExists(false)
    } else {
      getStakeAccounts(connection, anchorWallet, publicKey!)
        .then((stakeAccounts) => {
          if (stakeAccounts.length > 0) {
            setStakeAccountExists(true)
          }
        })
        .then(() =>
          getPythTokenBalance(connection, publicKey!).then((balance) =>
            setPythBalance(balance)
          )
        )
    }
  }, [connected])

  //handler
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(parseFloat(event.target.value))
  }

  //handler
  const handleDeposit = async () => {
    const stakeAccounts = await getStakeAccounts(
      connection,
      anchorWallet,
      publicKey!
    )

    try {
      const res = await depositTokens(
        connection,
        anchorWallet,
        publicKey!,
        amount
      )
      enqueueSnackbar('deposit successful!', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(e.message, { variant: 'error' })
    }
  }

  const handleCreateStakeAccount = async () => {
    console.log('create stake account')
    try {
      await createStakeAccount(connection, anchorWallet)
      enqueueSnackbar('stake account created!', { variant: 'success' })
      setStakeAccountExists(true)
    } catch (e) {
      enqueueSnackbar(e.message, { variant: 'error' })
    }
  }

  const handleChangeTab = (event: React.SyntheticEvent, newValue: string) => {
    setCurrentTab(newValue)
  }

  const handleHalfBalanceClick = () => {
    setAmount(Number(pythBalance) / 2)
  }

  const handleMaxBalanceClick = () => {
    setAmount(pythBalance)
  }

  useEffect(() => {
    console.log(currentTab)
  }, [currentTab])

  useEffect(() => {
    console.log(amount)
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
                    <div className={classes.balanceGroup}>
                      <div className={classes.amountInputLabel}>
                        <InputLabel
                          shrink
                          htmlFor="amount-pyth-lock"
                          className={classes.amountInputLabel}
                        >
                          Amount (PYTH)
                        </InputLabel>
                      </div>
                      <Typography variant="body1">
                        Balance: {pythBalance}
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
                    <Input
                      disableUnderline={true}
                      id="amount-pyth-lock"
                      type="number"
                      className={classes.amountInput}
                      onChange={handleChange}
                      value={amount?.toString()}
                      disabled={!stakeAccountExists}
                    />
                  </FormControl>
                </Box>
                <Grid container spacing={1} justifyContent="center">
                  <div className={classes.buttonGroup}>
                    {connected ? (
                      stakeAccountExists ? (
                        <Grid item xs={12}>
                          {currentTab === 'Deposit' ? (
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
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                            onClick={handleCreateStakeAccount}
                          >
                            Create Stake Account
                          </Button>
                        </Grid>
                      )
                    ) : (
                      <Grid item xs={12}>
                        <WalletMultiButton
                          variant="outlined"
                          disableRipple
                          className={classes.button}
                        >
                          Connect Wallet
                        </WalletMultiButton>
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
                <TableContainer style={{ maxHeight: '78vh' }}>
                  <Table
                    sx={{
                      [`& .${tableCellClasses.root}`]: {
                        borderBottom: 'none',
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell width="70%">Tokens</TableCell>
                        <TableCell align="right">Amount (PYTH)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(tokens).map((t) => (
                        <TableRow key={t[0]}>
                          <TableCell>{t[0]}</TableCell>
                          <TableCell align="right">
                            {connected ? t[1] : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Layout>
  )
}

export default Staking
