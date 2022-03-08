import Head from 'next/head'
import React from 'react'
import config from './config'

const SEO: React.FC<{ title: string }> = ({ title }) => {
  const siteTitle = config.title
  const description = config.description

  return (
    <Head>
      <title>{`${title} | ${siteTitle}`}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteTitle} />
    </Head>
  )
}

export default SEO
