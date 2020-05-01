import { TransactionBuilder, Networks, Asset, BASE_FEE, Operation, Server } from 'stellar-sdk'
import axios from 'axios'
import { get } from 'lodash'

const contract = 'GAWPG5WMHAA75S7ALQMP4E4E7OI5AMHT6LX2ZEOIQD5RX6FGEEO3B46K'
// SBJURUWXYBSXIGU46H6CPINEJVBCPKYVP6GJB42L5ZL4QNWP4QQSLQTP

// GDIMIMALHQ6NTLLNRRZIY4A4XGPJP5QGXCZQB5ST7S4CQR4NZMX7UVHD
// GBACA4O5XPFOJUUBFF6G6D4TLA67XUND4FPSUG7I3VZB2WJJ4NRNJ4AV
// GAYV4RYQZTDWE6REZ2RVS74XR2WJ6OBD3XPS4HUYX344ZRPCSORNESWT
// GADGR2RQS6D6XJRZYYIXF2346VSAKVTTEJZZLX4ZPUJQVPUQKZER7CMO
// GBBRHGVC2I5EUF66CREKEIJGYQ5PZ6MUSG2JANPJH453UV2XNAXGFCPK

const XLM = Asset.native()
const RAINYDAY = new Asset('RAINYDAY', contract)

export default async ({request, turrets}) => {
  await axios.get('https://api.darksky.net/forecast/dbc14b6d52ee4325b6c33ef4aac5ae34/35.707030,-83.950370', {
    params: {
      exclude: 'minutely,hourly,daily,alerts,flags'
    }
  })
  .then(({data}) => {
    if (
      /rain/gi.test(get(data, 'daily.icon'))
      || /rain/gi.test(get(data, 'summary'))
    ) return

    throw `It's not raining`
  })

  const server = new Server('https://horizon-testnet.stellar.org')

  const transaction = await server
  .loadAccount(contract)
  .then((account) => {
    return new TransactionBuilder(
      account,
      {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET
      }
    )
    .addOperation(Operation.changeTrust({
      asset: RAINYDAY,
      source: request.to
    }))
    .addOperation(Operation.payment({
      destination: request.to,
      asset: RAINYDAY,
      amount: '1',
      source: contract
    }))
    .setTimeout(0)
  })

  for (const turret of turrets) {
    transaction.addOperation(Operation.payment({
      destination: turret.vault,
      asset: XLM,
      amount: turret.fee,
    }))
  }

  return transaction.build().toXDR()
}

// test({request: {
//   to: 'GAWSNOA5AMEXLQ2SJM65RH25CEM7O7OV7ZYBSGSGNFUGBJBCGQRAAHOX'
// }, turrets: [{
//   "vault": "GD6JDEASY6CV2OC3VANDZZTUWKFKRDNPX5SBXH4OPEKHOHPQWN6T657G",
//   "signer": "GBC7HRL3LGT3YOMO2ERLESQONZ4QXNDPEBXLJTVIWRJ7V6RNGYU6FUZN",
//   "fee": "0.5"
// },{
//   "vault": "GD6JDEASY6CV2OC3VANDZZTUWKFKRDNPX5SBXH4OPEKHOHPQWN6T657G",
//   "signer": "GCZ7YWVVSO2MDK5EXDXQXEQTI5VP4J5OWWUCKQAVHN3Q3Y6YPPUH6WTY",
//   "fee": "0.5"
// }]})
// .then((data) => console.log(data))
// .catch((err) => console.error(err))