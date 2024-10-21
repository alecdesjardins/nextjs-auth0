import {
  ReadonlyRequestCookies,
  RequestCookies,
  ResponseCookies,
} from "../cookies"
import { User } from "../user"

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt: number // the time at which the access token expires in seconds since epoch
}

export interface SessionData {
  user: User
  tokenSet: TokenSet
  internal: {
    // the session ID from the authorization server
    sid: string
    // the time at which the session was created in seconds since epoch
    createdAt: number
  }
  [key: string]: unknown
}

export interface SessionConfiguration {
  /**
   * A boolean indicating whether rolling sessions should be used or not.
   *
   * When enabled, the session will continue to be extended as long as it is used within the inactivity duration.
   * Once the upper bound, set via the `absoluteDuration`, has been reached, the session will no longer be extended.
   *
   * Default: `true`.
   */
  rolling?: boolean
  /**
   * The absolute duration after which the session will expire. The value must be specified in seconds..
   *
   * Once the absolute duration has been reached, the session will no longer be extended.
   *
   * Default: 30 days.
   */
  absoluteDuration?: number
  /**
   * The duration of inactivity after which the session will expire. The value must be specified in seconds.
   *
   * The session will be extended as long as it was active before the inactivity duration has been reached.
   *
   * Default: 7 days.
   */
  inactivityDuration?: number
}

interface SessionStoreOptions extends SessionConfiguration {
  secret: string
}

export abstract class AbstractSessionStore {
  public secret: string
  public SESSION_COOKIE_NAME = "__session"
  public TOKEN_SET_COOKIE_NAME = "__token_set"

  private rolling: boolean
  private absoluteDuration: number
  private inactivityDuration: number

  public cookieConfig = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  } as const

  constructor({
    secret,

    rolling = true,
    absoluteDuration = 60 * 60 * 24 * 30, // 30 days in seconds
    inactivityDuration = 60 * 60 * 24 * 7, // 7 days in seconds
  }: SessionStoreOptions) {
    this.secret = secret

    this.rolling = rolling
    this.absoluteDuration = absoluteDuration
    this.inactivityDuration = inactivityDuration
  }

  abstract get(
    reqCookies: RequestCookies | ReadonlyRequestCookies
  ): Promise<SessionData | null>

  /**
   * save adds the encrypted session cookie as a `Set-Cookie` header. If the `iat` property
   * is present on the session, then it will be used to compute the `maxAge` cookie value.
   */
  abstract set(
    reqCookies: RequestCookies | ReadonlyRequestCookies,
    resCookies: ResponseCookies,
    session: SessionData,
    isNew?: boolean
  ): Promise<void>

  abstract delete(
    reqCookies: RequestCookies | ReadonlyRequestCookies,
    resCookies: ResponseCookies
  ): Promise<void>

  /**
   * epoch returns the time since unix epoch in seconds.
   */
  epoch() {
    return (Date.now() / 1000) | 0
  }

  /**
   * calculateMaxAge calculates the max age of the session based on createdAt and the rolling and absolute durations.
   */
  calculateMaxAge(createdAt: number) {
    if (!this.rolling) {
      return this.absoluteDuration
    }

    const updatedAt = this.epoch()
    const expiresAt = Math.min(
      updatedAt + this.inactivityDuration,
      createdAt + this.absoluteDuration
    )
    const maxAge = expiresAt - this.epoch()

    return maxAge > 0 ? maxAge : 0
  }
}