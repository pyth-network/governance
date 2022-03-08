import SEO from '@components/SEO'
import type { NextPage } from 'next'
import Layout from '../components/Layout'

const Home: NextPage = () => {
  return (
    <Layout>
      <SEO title={'App'} />
    </Layout>
  )
}

export default Home
