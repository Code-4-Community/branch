import { Hash } from '@smithy/hash-node'
import { buildQueryString } from '@smithy/querystring-builder'
import { SignatureV4 } from '@smithy/signature-v4'

const DSQL_HOST = /^[a-z0-9]+\.dsql\.([a-z0-9-]+)\.on\.aws$/

/** The cluster's region when `host` is an Aurora DSQL endpoint, else undefined. */
export function dsqlRegion(host: string): string | undefined {
  return DSQL_HOST.exec(host)?.[1]
}

/**
 * The IAM auth token DSQL takes as the password: a SigV4-presigned
 * `GET /?Action=DbConnect[Admin]`, minus the scheme. Mirrors @aws-sdk/dsql-signer,
 * which the lambdas' `--external:@aws-sdk/*` bundle cannot be relied on to carry.
 * Only checked at connect time, so a short expiry is fine.
 */
export async function dsqlAuthToken(
  host: string,
  user: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<string> {
  const region = dsqlRegion(host)
  if (!region) throw new Error(`${host} is not an Aurora DSQL endpoint`)
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'DSQL auth needs AWS credentials in the environment (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)',
    )
  }

  const signer = new SignatureV4({
    service: 'dsql',
    region,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      sessionToken: AWS_SESSION_TOKEN,
    },
    sha256: Hash.bind(null, 'sha256'),
  })
  const presigned = await signer.presign(
    {
      method: 'GET',
      protocol: 'https:',
      hostname: host,
      path: '/',
      query: { Action: user === 'admin' ? 'DbConnectAdmin' : 'DbConnect' },
      headers: { host },
    },
    { expiresIn: 900, signingDate: now },
  )
  return `${host}/?${buildQueryString(presigned.query ?? {})}`
}
