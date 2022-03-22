import * as React from 'react'
import PropTypes from 'prop-types'
import Header from './Header'

const Layout: React.FC<{}> = ({ children }) => {
  return (
    <>
      <Header />
      <main>
        <div className="grid min-h-screen grid-cols-12 gap-4 pb-44 pt-4">
          <div className="col-span-12 px-4 md:px-8 xl:col-span-10 xl:col-start-2 xl:px-4">
            {children}
          </div>
        </div>
      </main>
    </>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
