import * as React from 'react'
import PropTypes from 'prop-types'
import Header from './Header'
import Footer from './Footer'

const Layout: React.FC<{}> = ({ children }) => {
  return (
    <div className="flex flex-col justify-between h-screen">
      <Header />
      <main>
        {children}
        <div className="background-left z-[-1]" />
        <div className="sm:background-right z-[-1]" />
      </main>
      <Footer />
    </div>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
