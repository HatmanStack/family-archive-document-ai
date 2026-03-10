import adapterAuto from '@sveltejs/adapter-auto'
import adapterNode from '@sveltejs/adapter-node'
import adapterStatic from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { mdsvex } from 'mdsvex'

import mdsvexConfig from './mdsvex.config.js'

const adapter = {
  auto: adapterAuto(),
  node: adapterNode(),
  static: adapterStatic({
    assets: 'build',
    fallback: 'index.html',
    pages: 'build',
    strict: false,
  }),
}

export default {
  extensions: ['.svelte', ...(mdsvexConfig.extensions ?? [])],
  kit: {
    paths: {
      relative: false,
    },
    files: {
      assets: 'static',
      lib: 'lib',
      params: 'params',
      routes: 'routes',
      appTemplate: 'app.html',
      hooks: {
        server: 'hooks.server',
      },
    },
    adapter:
      process.env.ADAPTER
        // @ts-expect-error adapter types
        ? adapter[process.env.ADAPTER.toLowerCase()]
        : Object.keys(process.env).some(key => ['NETLIFY', 'VERCEL'].includes(key))
          ? adapter.auto
          : adapter.static,
    prerender: {
      handleMissingId: 'warn',
      handleHttpError: ({ path, referrer, message }) => {
        if (path.includes('//') && referrer) {
          return
        }
        if (message.includes('401') && (path.includes('/admin') || path.includes('/login'))) {
          return
        }
        if (path === '/favicon.png') {
          return
        }
        throw new Error(message)
      },
    },
  },
  preprocess: [mdsvex(mdsvexConfig), vitePreprocess()],
}
