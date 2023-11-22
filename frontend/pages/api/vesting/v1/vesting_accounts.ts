import { NextApiRequest, NextApiResponse } from 'next'

export default async function handlerVestingAccounts(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { owner } = req.query

  if (owner == undefined || owner instanceof Array) {
    res.status(400).json({
      error: "Must provide the 'owner' query parameters",
    })
  } else {
    res.status(200).json({ owner: owner })
  }
}
