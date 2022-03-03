import { Container, Divider, Typography } from '@mui/material'
import { makeStyles } from '@mui/styles'
import React from 'react'

const useStyles = makeStyles((theme) => ({
  footer: {},
  footerDivider: {
    margin: '48px 0px 26px',
  },
}))

const Footer = () => {
  const classes = useStyles()

  return (
    <footer className={classes.footer}>
      <section>
        <Container>
          <Divider className={classes.footerDivider} />
          <Typography variant="body2" align="center" sx={{ marginBottom: 5 }}>
            &copy; 2022 Pyth Network
          </Typography>
        </Container>
      </section>
    </footer>
  )
}

export default Footer
