import { Button, Dialog, Hidden, IconButton, Theme } from '@mui/material'
import { makeStyles } from '@mui/styles'
import Image from 'next/image'
import { useRouter } from 'next/router'
import React, { useCallback, useState } from 'react'
import { colors, fonts } from './muiTheme'
import Link from './Link'
import { WalletMultiButton } from '@solana/wallet-adapter-material-ui'

const useStyles = makeStyles((theme: Theme) => ({
  header: {
    display: 'flex',
    alignItems: 'center',
    margin: '0 auto',
    maxWidth: 1100,
    padding: '16px 16px 0px',
    width: '100%',
  },
  headerLink: {
    color: 'inherit',
    fontFamily: fonts.roboto,
    fontSize: 16,
    fontWeight: 500,
    margin: '0px 27px',
    '&:hover': {
      color: `${colors.pink}F0`,
    },
  },
  headerLinkActive: {
    color: colors.pink,
    '&::before': {
      content: '""',
      position: 'absolute',
      transform: 'translate(-13px, 10px)',
      width: 5,
      height: 5,
      borderRadius: '50%',
      backgroundColor: colors.pink,
    },
  },
  menuDialog: {
    backgroundColor: colors.black,
    textAlign: 'center',
    alignItems: 'center',
    '& $headerLink': {
      ...theme.typography.h1,
      color: colors.white,
      marginTop: 24,
      '&:first-of-type': {
        marginTop: 28,
      },
      '&:last-of-type': {
        marginBottom: 48,
      },
      '&:hover': {
        color: colors.purpleButtonHover,
      },
    },
    '& $headerLinkActive': {
      color: colors.purpleButtonHover,
      '&::before': {
        width: 0,
        height: 0,
      },
    },
  },
  menuButton: {
    '& .MuiButton-root': {
      padding: 10,
    },
    '&.MuiIconButton-root': {
      padding: 18,
    },
  },
  connectWalletButton: {
    // '& .MuiButton-root': {
    //   padding: 10,
    // },
  },
}))

const Header = () => {
  const classes = useStyles()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleOpen = useCallback(() => {
    setOpen(true)
  }, [])
  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])
  const links = (
    <>
      <Link
        href="/governance/"
        className={
          router.pathname == '/governance/'
            ? classes.headerLinkActive
            : classes.headerLink
        }
      >
        Governance
      </Link>
      <Link
        href="/staking/"
        className={
          router.pathname == '/staking/'
            ? classes.headerLinkActive
            : classes.headerLink
        }
      >
        Staking
      </Link>
    </>
  )

  return (
    <header className={classes.header}>
      <Link href="/">
        <div style={{ display: 'flex' }}>
          <Image
            src="/images/pyth-logo.svg"
            alt="Pyth logo"
            height={55}
            width={55}
          />
        </div>
      </Link>
      <div style={{ flex: 1 }} />
      <Hidden mdDown implementation="css">
        {links}
      </Hidden>
      <div style={{ flex: 1 }} />
      <div className={classes.connectWalletButton}>
        <WalletMultiButton size="small" />
      </div>
      <Hidden mdUp implementation="css">
        <div className={classes.menuButton}>
          <Button onClick={handleOpen}>
            <Image
              src="/images/menu-dark.svg"
              alt="Menu icon"
              height={48}
              width={32}
            />
          </Button>
          <Dialog
            fullScreen
            open={open}
            onClose={handleClose}
            PaperProps={{ className: classes.menuDialog }}
          >
            <header className={classes.header}>
              <Link href="/">
                <div style={{ display: 'flex' }}>
                  <Image
                    src="/images/pyth-logo.svg"
                    alt="Pyth logo"
                    height={55}
                    width={55}
                  />
                </div>
              </Link>
              <div style={{ flex: 1 }} />
              <IconButton onClick={handleClose} className={classes.menuButton}>
                <Image
                  src="/images/close.svg"
                  alt="Close menu icon"
                  height={32}
                  width={32}
                />
              </IconButton>
            </header>
            {links}
          </Dialog>
        </div>
      </Hidden>
    </header>
  )
}

export default Header
