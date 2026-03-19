/// <reference types="@sveltejs/kit" />

import type { AuthenticatedUser } from '$lib/auth/middleware'
import type { FFFBase, FFFMedia, FFFMention } from 'fff-flavored-frontmatter'

declare global {
  namespace App {
    interface Locals {
      user: AuthenticatedUser | null
    }
  }
}

interface ImportMetaEnv extends Readonly<Record<string, string>> {
  readonly URARA_SITE_DOMAIN?: string
  readonly URARA_SITE_PROTOCOL?: 'http://' | 'https://'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  glob: <Module = { [key: string]: unknown }>(pattern: string) => Record<string, Module>
}

declare global {
  namespace Urara {
    namespace Post {
      type Frontmatter = {
        created: string
        author?: string

        flags?: string[]
        image?: string
        layout?: 'article' | 'note' | 'photo' | 'reply'
        path: string
        published?: string
        slug: string
        toc?: false | Toc[]
        type: 'article' | 'audio' | 'bookmark' | 'like' | 'note' | 'photo' | 'reply' | 'repost' | 'video'

        updated: string
      }
      & Omit<FFFBase, 'flags'>
      & Pick<FFFMedia, 'alt'> & Pick<FFFMention, 'in_reply_to'>
      interface Toc {
        children?: Toc[]
        depth: number
        slug?: string
        title?: string
      }
      interface Module {
        default: {
          render: () => {
            css: {
              code: string
            }
            head: string
            html: string
          }
        }
        metadata: Frontmatter
      }
    }
    type Post = { html?: string, _parsedDate?: string, _filePath?: string } & Post.Frontmatter
    interface Page { path: string, title?: string }
  }
}
