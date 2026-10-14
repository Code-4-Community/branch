import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { DsqlSigner } from '@aws-sdk/dsql-signer'
import { dsqlAuthToken, dsqlRegion } from '../src/dsql'

const HOST = 'abcdefghijklmnopqrstuvwxyz.dsql.us-east-2.on.aws'
const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  sessionToken: 'session/token+with=reserved&chars',
}
const env = {
  AWS_ACCESS_KEY_ID: credentials.accessKeyId,
  AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
  AWS_SESSION_TOKEN: credentials.sessionToken,
}
const NOW = new Date('2026-10-14T12:00:00Z')

describe('dsqlRegion', () => {
  it('reads the region from a cluster endpoint', () => {
    expect(dsqlRegion(HOST)).toBe('us-east-2')
  })

  it.each(['localhost', 'branch-rds.abc.us-east-2.rds.amazonaws.com', `${HOST}.evil.com`])(
    'rejects %s',
    (host) => {
      expect(dsqlRegion(host)).toBeUndefined()
    },
  )
})

describe('dsqlAuthToken', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it.each([
    ['admin', 'getDbConnectAdminAuthToken'],
    ['branch_app', 'getDbConnectAuthToken'],
  ] as const)('matches @aws-sdk/dsql-signer for %s', async (user, method) => {
    jest.useFakeTimers({ now: NOW })
    const signer = new DsqlSigner({ hostname: HOST, region: 'us-east-2', credentials, expiresIn: 900 })
    const expected = await signer[method]()

    expect(await dsqlAuthToken(HOST, user, env, NOW)).toBe(expected)
  })

  it('refuses without credentials rather than sending an unsigned token', async () => {
    await expect(dsqlAuthToken(HOST, 'admin', {})).rejects.toThrow(/AWS credentials/)
  })
})
