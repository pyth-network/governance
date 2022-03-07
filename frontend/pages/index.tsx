import SEO from '@components/SEO'
import type { NextPage } from 'next'
import Layout from '../components/Layout'
import styles from '../styles/Home.module.css'

const Home: NextPage = () => {
  return (
    <Layout>
      <SEO title={'App'} />
      <h1 className={styles.title}>
        Welcome to <a href="https://nextjs.org">Next.js!</a>
      </h1>

      <p className={styles.description}>
        Get started by editing{' '}
        <code className={styles.code}>pages/index.js</code>
      </p>

      <div className={styles.grid}></div>
    </Layout>
  )
}

export default Home
