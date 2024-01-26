import { NextApiRequest, NextApiResponse } from 'next'
import { ZstdInit } from '@oneidentity/zstd-js'

export default async function handlerSnapshot(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { ZstdStream } = await ZstdInit()
  const data = ZstdStream.decompress(
    Buffer.from(
      '28b52ffd0058ed0100440355c3f14f7cc04f0be9622664781048f7a82f0ec2d9cabc75c910de0618ab304fc4973fbc36ee33940164552b0800000000050b00010014791f4001',
      'hex'
    )
  )

  res.status(200).json(Buffer.from(data).toString('hex'))
}
