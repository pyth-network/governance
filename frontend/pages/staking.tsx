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
} from '@mui/material'
import Layout from '../components/Layout'
import { colors } from '@components/muiTheme'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { ChangeEvent, MouseEvent, useMemo, useState } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-material-ui'
import { createStakeAccount } from 'actions/createStakeAccount'

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
    marginBottom: 30,
    color: 'white',
    '&.Mui-focused': {
      color: colors.white,
    },
  },
  amountInput: {
    '& .MuiInput-input': {
      border: `1px solid ${colors.lightGreyLines}`,
      borderRadius: 100,
      marginTop: 15,
      padding: 15,
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
}))

const tokens = { Unlocked: 10000, Locked: 100, Unvested: 1000 }

const Staking: NextPage = () => {
  const classes = useStyles()
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()
  const [amount, setAmount] = useState<Number>(0)
  const pubkey = useMemo(() => publicKey?.toBase58(), [publicKey])

  //handler
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(parseInt(event.target.value))
  }

  //handler
  const handleLock = async () => {
    console.log(amount)
  }

  return (
    <Layout>
      <Container className={classes.sectionContainer}>
        <Grid container justifyContent="center">
          <Grid item xs={12}>
            <Card className={classes.card}>
              <CardContent>
                <Box
                  component="form"
                  noValidate
                  autoComplete="off"
                  className={classes.form}
                >
                  <FormControl fullWidth variant="standard">
                    <InputLabel
                      shrink
                      htmlFor="amount-pyth-lock"
                      className={classes.amountInputLabel}
                    >
                      Amount (PYTH)
                    </InputLabel>
                    <Input
                      disableUnderline={true}
                      id="amount-pyth-lock"
                      type="number"
                      className={classes.amountInput}
                      onChange={handleChange}
                      value={amount?.toString()}
                    />
                  </FormControl>
                </Box>
                <Grid container spacing={1} justifyContent="center">
                  <div className={classes.buttonGroup}>
                    {connected ? (
                      <>
                        <Grid item xs={6}>
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                            onClick={handleLock}
                          >
                            Lock
                          </Button>
                        </Grid>
                        <Grid item xs={6}>
                          <Button
                            variant="outlined"
                            disableRipple
                            className={classes.button}
                          >
                            Unlock
                          </Button>
                        </Grid>
                      </>
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
