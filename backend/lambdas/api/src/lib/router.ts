/**
 * Express-like Router for API Gateway Lambda
 *
 * Supports method-based route registration with {param} placeholders
 * and middleware chains.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { stripVersionPrefix } from './path-utils'

export type RouteHandler = (
  event: APIGatewayProxyEvent,
  context: RequestContext
) => Promise<APIGatewayProxyResult>

export type Middleware = (
  event: APIGatewayProxyEvent,
  context: RequestContext
) => Promise<APIGatewayProxyResult | null | undefined>

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

interface Route {
  method: HttpMethod
  pattern: string
  regex: RegExp
  paramNames: string[]
  middlewares: Middleware[]
  handler: RouteHandler
  skipDefaultMiddleware: boolean
}

export interface RouterOptions {
  defaultMiddleware?: Middleware[]
}

/**
 * Compile a route pattern like '/messages/{conversationId}' into a regex
 * and extract parameter names.
 */
function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const regexStr = pattern.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
    paramNames.push(paramName)
    return '([^/]+)'
  })
  return {
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
  }
}

export class Router {
  private routes: Route[] = []
  private defaultMiddleware: Middleware[]

  constructor(options: RouterOptions = {}) {
    this.defaultMiddleware = options.defaultMiddleware ?? []
  }

  /**
   * Register a GET route
   */
  get(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('GET', pattern, args, false)
  }

  /**
   * Register a POST route
   */
  post(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('POST', pattern, args, false)
  }

  /**
   * Register a PUT route
   */
  put(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('PUT', pattern, args, false)
  }

  /**
   * Register a DELETE route
   */
  delete(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('DELETE', pattern, args, false)
  }

  /**
   * Register a PATCH route
   */
  patch(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('PATCH', pattern, args, false)
  }

  /**
   * Register a public GET route (skips default middleware such as auth).
   */
  publicGet(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('GET', pattern, args, true)
  }

  /**
   * Register a public POST route (skips default middleware such as auth).
   */
  publicPost(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('POST', pattern, args, true)
  }

  /**
   * Match incoming event against registered routes and execute middleware chain + handler.
   * Returns null if no route matches.
   */
  async handle(
    event: APIGatewayProxyEvent,
    context: RequestContext
  ): Promise<APIGatewayProxyResult | null> {
    const method = event.httpMethod as HttpMethod
    const rawPath = event.path || event.resource
    const path = stripVersionPrefix(rawPath)

    for (const route of this.routes) {
      if (route.method !== method) continue
      const match = route.regex.exec(path)
      if (!match) continue

      // Populate pathParameters from capture groups
      if (route.paramNames.length > 0) {
        event.pathParameters = event.pathParameters || {}
        for (let i = 0; i < route.paramNames.length; i++) {
          event.pathParameters[route.paramNames[i]] = decodeURIComponent(match[i + 1])
        }
      }

      // Run default middleware unless route opted out
      if (!route.skipDefaultMiddleware) {
        for (const middleware of this.defaultMiddleware) {
          const result = await middleware(event, context)
          if (result) return result
        }
      }

      // Run per-route middleware chain
      for (const middleware of route.middlewares) {
        const result = await middleware(event, context)
        if (result) return result
      }

      // Run handler
      return route.handler(event, context)
    }

    return null
  }

  private addRoute(
    method: HttpMethod,
    pattern: string,
    args: [...Middleware[], RouteHandler],
    skipDefaultMiddleware: boolean
  ): void {
    const handler = args[args.length - 1] as RouteHandler
    const middlewares = args.slice(0, -1) as Middleware[]
    const { regex, paramNames } = compilePattern(pattern)

    this.routes.push({
      method,
      pattern,
      regex,
      paramNames,
      middlewares,
      handler,
      skipDefaultMiddleware,
    })
  }
}
