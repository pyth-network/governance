import RealmHeader from '@components/RealmHeader'
import type { NextPage } from 'next'
import { useState } from 'react'
import Layout from '../components/Layout'
import Tabs from '../components/Tabs'
import SEO from '../components/SEO'
import ApproveAllBtn from '@components/ApproveAllBtn'
import NewProposalBtn from '@components/NewProposalBtn'

const Governance: NextPage = () => {
  const [filteredProposals, setFilteredProposals] = useState([])
  const [activeTab, setActiveTab] = useState<string>('Proposals')

  return (
    <Layout>
      <SEO title={'Governance'} />
      <>
        <div className="grid grid-cols-12 gap-4">
          <div
            className={`order-last col-span-12 rounded-lg bg-jaguar md:order-first md:col-span-7 lg:col-span-8`}
          >
            <RealmHeader />
            <div className="p-4 text-lavenderGray md:p-6">
              <Tabs
                activeTab={activeTab}
                onChange={(t) => setActiveTab(t)}
                tabs={['Proposals', 'About']}
              />
              {activeTab === 'Proposals' && (
                <>
                  <div className="flex items-center justify-between pb-3">
                    <h4 className="text-fgd-2 mb-0 font-normal">{`${filteredProposals.length} Proposals`}</h4>
                    <div className="flex items-center space-x-4">
                      <ApproveAllBtn />
                      <NewProposalBtn />
                      {/* <ProposalFilter
                        filters={filters}
                        setFilters={setFilters}
                      /> */}
                    </div>
                  </div>
                  {/* <div className="space-y-3">
                    {filteredProposals.length > 0 ? (
                      <>
                        {paginatedProposals.map(([k, v]) => (
                          <ProposalCard
                            key={k}
                            proposalPk={new PublicKey(k)}
                            proposal={v.account}
                          />
                        ))}
                        <PaginationComponent
                          totalPages={Math.ceil(
                            filteredProposals.length / proposalsPerPage
                          )}
                          onPageChange={onProposalPageChange}
                        ></PaginationComponent>
                      </>
                    ) : (
                      <div className="bg-bkg-3 text-fgd-3 rounded-lg px-4 py-4 text-center md:px-6">
                        No proposals found
                      </div>
                    )}
                  </div> */}
                </>
              )}
            </div>
          </div>
        </div>
      </>
    </Layout>
  )
}

export default Governance
