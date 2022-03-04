import { PaletteMode } from '@mui/material'
import { createTheme, responsiveFontSizes } from '@mui/material/styles'

export const colors = {
  pythPurple: '#6633CC',
  pythPurple50: 'rgba(102, 51, 204, .5)',
  white: '#FFFFFF',
  whiteText: 'rgba(255,255,255,.87)',
  black: '#0B0B0B',
  darkPurpleBackground: '#2F1E51',
  darkerPurpleBackground: '#100E21',
  lightPurple: '#FAF4FE',
  headlineText: '#0B0B0B',
  bodyText: '#484848',
  purpleButtonHover: '#8246FA',
  purpleButtonPress: '#4A2692',
  pink: '#D7A5FF',
  textLightGrey: '#939393',
  lightGreyLines: '#D2D2D2',
  red: '#DD6069',
  green: '#22D297',
  hoverLightPurple: '#FDFAFF',
  darkYellow: '#7c6c0a',
  lightYellow: '#c2a90f',
  darkGrey: '#191919',
}

export const fonts = {
  arboria: 'arboria, sans-serif',
  roboto: 'roboto, sans-serif',
  robotoMono: 'roboto-mono, monospace',
}

const theme = responsiveFontSizes(
  createTheme({
    typography: {
      h1: {
        color: colors.whiteText,
        fontFamily: fonts.arboria,
        fontSize: 50,
        fontWeight: 400,
      },
      h2: {
        color: colors.whiteText,
        fontFamily: fonts.arboria,
        fontSize: 50,
        fontWeight: 400,
      },
      h3: {
        color: colors.whiteText,
        fontFamily: fonts.arboria,
        fontSize: 36,
        fontWeight: 400,
      },
      h4: {
        color: colors.whiteText,
        fontFamily: fonts.arboria,
        fontSize: 35,
        fontWeight: 500,
      },
      h5: {
        color: colors.whiteText,
        fontFamily: fonts.roboto,
        fontSize: 24,
        fontWeight: 500,
      },
      h6: {
        color: colors.whiteText,
        fontFamily: fonts.roboto,
        fontSize: 16,
        fontWeight: 500,
      },
      subtitle1: {
        fontFamily: fonts.robotoMono,
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: 2.18,
        textTransform: 'uppercase',
      },
      body1: {
        fontFamily: fonts.robotoMono,
        fontSize: 18,
        fontWeight: 500,
      },
      body2: {
        fontFamily: fonts.roboto,
        fontSize: 14,
        fontWeight: 500,
      },
    },
    palette: {
      mode: 'dark' as PaletteMode,
      background: {
        default: colors.black,
      },
      divider: colors.pythPurple50,
      primary: {
        main: colors.pythPurple,
      },
      secondary: {
        main: colors.pink,
      },
      text: {
        primary: colors.whiteText,
        secondary: colors.headlineText,
      },
      warning: {
        main: colors.darkYellow,
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 49,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            padding: '18px 32px',
            '&:hover $endIcon': {
              marginLeft: 28,
            },
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
            '&:active': {
              boxShadow: 'none',
            },
          },
          containedPrimary: {
            '&:hover': {
              backgroundColor: colors.purpleButtonHover,
            },
            '&:active': {
              backgroundColor: colors.purpleButtonPress,
            },
          },
          outlined: {
            borderWidth: '2px',
            padding: '18px 32px',
            transition:
              'background-color 300ms, border-color 300ms, color 300ms',
          },
          endIcon: {
            marginLeft: 28,
            transition: 'margin-left 300ms',
          },
          iconSizeMedium: {
            '& *:first-child': {
              fontSize: 16,
            },
          },
        },
      },
      MuiContainer: {
        styleOverrides: {
          root: {
            paddingLeft: 26,
            paddingRight: 26,
          },
          maxWidthLg: {
            '@media (min-width: 1280px)': {
              maxWidth: 1096,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            border: `1px solid ${colors.lightGreyLines}`,
            borderRadius: 100,
          },
          input: {
            padding: '12px 24px',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: colors.black,
            backgroundImage: 'none',
          },
          elevation1: {
            boxShadow: '0px 0px 10px 2px #00000014',
          },
          rounded: {
            borderRadius: 18,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          track: {
            backgroundColor: colors.pythPurple,
            '.MuiSwitch-colorPrimary.Mui-disabled + &': {
              backgroundColor: colors.pythPurple,
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: `${colors.lightGreyLines}80`,
            padding: '16px 26px',
          },
          head: {
            color: colors.whiteText,
            padding: '11px 26px 8px',
          },
          body: {
            color: colors.whiteText,
            fontFamily: fonts.roboto,
            fontWeight: 500,
            fontSize: 18,
          },
          footer: {
            borderBottom: 'none',
            color: colors.whiteText,
          },
        },
      },
    },
  })
)

export default theme
