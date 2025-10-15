import crypto from 'crypto'

type ResumeTokenPayload = {
  c: string // conversationId
  g: string // generationId
  p: number // lastChunkPosition (accumulated content length)
  m: string // lastPersistedMessageId
  exp: number // unix seconds expiry
}

export class ResumeTokenService {
  private static instance: ResumeTokenService | null = null
  private secret: Buffer

  private constructor(secret: Buffer) {
    this.secret = secret
  }

  static getInstance(): ResumeTokenService {
    if (ResumeTokenService.instance) return ResumeTokenService.instance
    const envSecret = process.env.RESUME_TOKEN_SECRET
    let secretBuf: Buffer
    if (envSecret && envSecret.length >= 32) {
      secretBuf = Buffer.from(envSecret)
    } else {
      // Autogenerate a random secret for single-instance (dev) scenarios
      secretBuf = crypto.randomBytes(32)
    }
    ResumeTokenService.instance = new ResumeTokenService(secretBuf)
    return ResumeTokenService.instance
  }

  sign(payload: ResumeTokenPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' }
    const enc = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url')
    const body = enc(payload)
    const head = enc(header)
    const data = `${head}.${body}`
    const sig = crypto.createHmac('sha256', this.secret).update(data).digest('base64url')
    return `${data}.${sig}`
  }

  verify(token: string): ResumeTokenPayload | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      const [head, body, sig] = parts
      const data = `${head}.${body}`
      const expected = crypto.createHmac('sha256', this.secret).update(data).digest('base64url')
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ResumeTokenPayload
      if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
      return payload
    } catch {
      return null
    }
  }
}


