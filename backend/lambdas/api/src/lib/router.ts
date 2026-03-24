/**
 * Express-like Router for API Gateway Lambda
 *
 * Supports method-based route registration with {param} placeholders
 * and middleware chains.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'

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

  /**
   * Register a GET route
   */
  get(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('GET', pattern, args)
  }

  /**
   * Register a POST route
   */
  post(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('POST', pattern, args)
  }

  /**
   * Register a PUT route
   */
  put(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('PUT', pattern, args)
  }

  /**
   * Register a DELETE route
   */
  delete(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('DELETE', pattern, args)
  }

  /**
   * Register a PATCH route
   */
  patch(pattern: string, ...args: [...Middleware[], RouteHandler]): void {
    this.addRoute('PATCH', pattern, args)
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
    const rawPath = event.resource || event.path
    const path = rawPath.replace(/^\/v1/, '') || '/'

    for (const route of this.routes) {
      if (route.method !== method) continue
      if (!route.regex.test(path)) continue

      // Run middleware chain
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
    args: [...Middleware[], RouteHandler]
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
    })
  }
}
