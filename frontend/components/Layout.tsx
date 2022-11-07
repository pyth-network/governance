import * as React from 'react'
import PropTypes from 'prop-types'
import Header from './Header'
import Footer from './Footer'

const Layout: React.FC<{}> = ({ children }) => {
  return (
    <div className="flex h-screen flex-col justify-between">
      <Header />
      <main>{children}</main>
      <img
        src="/orb.png"
        className="pointer-events-none absolute left-0 top-0 -z-[1]"
      />
      <Footer />
    </div>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
