module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    screens: {
      sm: '480px',
      md: '768px',
      lg: '976px',
      xl: '1440px',
    },
    textColor: {
      white: 'rgba(255,255,255,.87)',
      pink: '#D7A5FF',
      scampi: '#696890',
      darkSlateBlue: '#42428E',
      lavenderGray: '#BABAD2',
    },
    colors: {
      pythPurple: '#6633CC',
      black: '#0B0B0B',
      darkerPurpleBackground: '#100E21',
      jaguar: '#19172A',
      blueGem: '#4E2F92',
      blueGemHover: '#49338D',
      valhalla: '#2E2E49',
      mediumSlateBlue: '#8246FA',
      darkSlateBlue: '#42428E',
      hoverGray: 'rgba(255, 255, 255, 0.08)',
      ebonyClay: '#563250',
      blackRussian: '#1A1F2E',
      bunting: '#283047',
      purpleHeart: '#5E3CC4',
      paynesGray: '#383852',
      cherryPie: '#34304E',
    },
    fontFamily: {
      arboria: 'arboria, sans-serif',
      roboto: 'roboto, sans-serif',
      robotoMono: 'roboto-mono, monospace',
      inter: 'inter, sans-serif',
      poppins: 'poppins, sans-serif',
    },
    extend: {
      spacing: {
        128: '32rem',
        144: '36rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--gradient-color-stops))',
      },
    },
  },
  plugins: [],
}
