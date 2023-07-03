import PropTypes from 'prop-types'
import * as React from 'react'
import Footer from './Footer'
import Header from './Header'

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen flex-col justify-between">
      <Header />
      <main>{children}</main>
      <img
        src="/orb.png"
        className="pointer-events-none absolute left-0 top-0 -z-[1] max-h-screen object-cover"
      />
      <Footer />
    </div>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
