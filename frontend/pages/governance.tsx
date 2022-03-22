import RealmHeader from '@components/RealmHeader'
import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const Governance: NextPage = () => {
  return (
    <Layout>
      <SEO title={'Governance'} />
      <>
        <div className="grid grid-cols-12 gap-4">
          <div
            className={`bg-bkg-2 order-last col-span-12 rounded-lg md:order-first md:col-span-7 lg:col-span-8`}
          >
            <RealmHeader />
          </div>
        </div>
      </>
    </Layout>
  )
}

export default Governance
