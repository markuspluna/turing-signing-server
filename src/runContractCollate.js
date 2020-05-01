import AWS from 'aws-sdk'
import { Transaction, Networks } from 'stellar-sdk'
import { chain, map, each, compact, shuffle } from 'lodash'
import { inspectTransactionSigners } from '@stellar-expert/tx-signers-inspector'
import axios from 'axios'
import Promise from 'bluebird'

import { isDev, headers, parseError } from './js/utils'

AWS.config.setPromisesDependency(Promise)

const s3 = new AWS.S3()
const horizon = process.env.STELLAR_NETWORK === 'TESTNET' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'

// Support multisig on XLM payment accounts
// If response isn't a valid signed XDR ready for submission error out
// If a request was successful the same request should be successful again
  // Main concern here is fees, need to check did it increase balance by the fee not just does it in the request
// Right now user pays for turing signing server fees, that might should be on the issuer (this) side
// Axios should have timeouts
// How do turing servers ensure contracts have fee logic built in?

export default async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false

  try {
    const contractTurrets = isDev ? ['https://localhost:4000/dev'] :
    await s3.getObjectTagging({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: event.pathParameters.hash,
    }).promise()
    .then(({TagSet}) => map(TagSet, (tag) => Buffer.from(tag.Value, 'base64').toString('utf8')))

    // const turretsContractData = await Promise.map(contractTurrets, async (turret) =>
    //   axios.get(`${turret}/contract/${event.pathParameters.hash}`)
    //   .then(({data}) => data)
    //   .catch(() => console.error( // Don't error out if a turingSigningServer request fails
    //       err.response
    //       ? err.response.statusText
    //         || err.response.data
    //       : err
    //     )
    //   )
    // ).then((data) => compact(data))  // Remove failed requests

    // Not forwarding turretsContractData as I think it opens an attack vector for bad fees to be encoded without any way to check
      // Only exception would be if a user were paying turing fees not the contract

    const contractTurretResponses = await Promise.map(contractTurrets, async (turret) =>
      axios.post(`${turret}/contract/${event.pathParameters.hash}/run`,
      JSON.parse(event.body)
      // {
      //   request: JSON.parse(event.body),
      //   turrets: turretsContractData
      // }
      )
      .then(({data}) => data)
      .catch((err) => console.error( // Don't error out if a turingSigningServer request fails
          err.response
          ? err.response.statusText
            || err.response.data
          : err
        )
      )
    ).then((data) => compact(data)) // Remove failed requests

    const xdrs = chain(contractTurretResponses)
    .map('xdr')
    .uniq()
    .value()

    if (xdrs.length > 1)
      throw 'Mismatched XDRs'

    const transaction = new Transaction(xdrs[0], Networks[process.env.STELLAR_NETWORK])
    const schema = await inspectTransactionSigners(transaction, { horizon })
    const signatures = []

    each(
      shuffle(contractTurretResponses),
      (response) =>
    { // bugged contracts should be skipped if the sig is invalid
      if (schema.checkFeasibility([
        ...signatures,
        JSON.parse(event.body).source
      ])) return

      try {
        transaction.addSignature(response.signer, response.signature)
        signatures.push(response.signer)
      }

      catch(err) {
        console.error(err)
      }
    })

    return {
      headers: {
        ...headers,
        'Content-Type': 'text/plain'
      },
      statusCode: 200,
      body: transaction.toXDR()
    }
  }

  catch(err) {
    return parseError(err)
  }
}