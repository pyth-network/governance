import type { NextPage } from 'next'
import { makeStyles } from '@mui/styles'
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Theme,
  Typography,
} from '@mui/material'
import { colors } from '@components/muiTheme'
import Layout from '../components/Layout'
import Image from 'next/image'
import clsx from 'clsx'
import formatNumToCurrency from 'utils/formatNumToCurrency'
import { useState } from 'react'

const useStyles = makeStyles((theme: Theme) => ({
  sectionContainer: {
    paddingTop: 127,
    paddingBottom: 127,
  },
  card: {
    backgroundColor: '#2F343B',
    margin: 'auto',
  },
  cardTitle: {
    '&.MuiTypography-root': {
      fontSize: 25,
      fontWeight: 900,
    },
  },
  boxSubtitle: {
    color: '#A4ACB7',
  },
  yourAccount: {
    backgroundColor: colors.black,
    marginTop: 20,
    borderRadius: 18,
    padding: 15,
  },
  amount: {
    fontFamily: 'Inter',
    fontWeight: 700,
  },
  boxAmount: {
    fontSize: 24,
  },
}))

const Governance: NextPage = () => {
  const classes = useStyles()
  const [votes, setVotes] = useState(0)

  return (
    <Layout>
      <Container className={classes.sectionContainer}>
        <Grid container spacing={2}>
          <Grid item xs={8}>
            <Card className={classes.card}>
              <CardContent>
                <div style={{ display: 'flex' }}>
                  <Image
                    src="/images/pyth-logo.svg"
                    alt="Pyth logo"
                    height={25}
                    width={25}
                  />
                  <div style={{ flex: 0.02 }} />
                  <Typography variant="h2" className={classes.cardTitle}>
                    Pyth DAO
                  </Typography>
                </div>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={4}>
            <Card className={classes.card}>
              <CardContent>
                <Typography variant="h2" className={classes.cardTitle}>
                  Your Account
                </Typography>
                <Box className={classes.yourAccount}>
                  <Typography
                    variant="subtitle2"
                    className={classes.boxSubtitle}
                  >
                    Votes
                  </Typography>
                  <Typography
                    className={clsx(classes.amount, classes.boxAmount)}
                  >
                    {votes}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Layout>
  )
}

export default Governance
