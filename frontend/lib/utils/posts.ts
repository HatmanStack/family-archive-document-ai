import type { FFFFlavoredFrontmatter } from 'fff-flavored-frontmatter'

interface GenPostsOptions {
  filterUnlisted?: boolean
  modules?: { [path: string]: Urara.Post.Module }
  postHtml?: boolean
  postLimit?: number
}

type GenPostsFunction = (options?: GenPostsOptions) => Urara.Post[]

type GenTagsFunction = (posts: Urara.Post[]) => string[]

export function typeOfPost(fm: FFFFlavoredFrontmatter): 'article' | 'audio' | 'bookmark' | 'like' | 'note' | 'photo' | 'reply' | 'repost' | 'video' {
  return fm.title
    ? 'article'
    : fm.image
      ? 'photo'
      : fm.audio
        ? 'audio'
        : fm.video
          ? 'video'
          : fm.bookmark_of
            ? 'bookmark'
            : fm.like_of
              ? 'like'
              : fm.repost_of
                ? 'repost'
                : fm.in_reply_to
                  ? 'reply'
                  : 'note'
}

export const genPosts: GenPostsFunction = ({
  filterUnlisted = false,
  modules = import.meta.glob<Urara.Post.Module>('/src/routes/**/*.{md,svelte.md}', { eager: true }),
  postHtml = false,
  postLimit = undefined,
} = {}) =>
  Object.entries(modules)
    .map(([, module]) => ({
      ...module.metadata,
      html:
          postHtml || typeOfPost(module.metadata) !== 'article'
            ? module.default
                .render()
                .html // eslint-disable-next-line no-control-regex
                .replace(/[\u0000-\u001F]/g, '')
                .replace(/[\r\n]/g, '')
                .match(/<main [^>]+>(.*?)<\/main>/gi)?.[0]
                .replace(/<main [^>]+>(.*?)<\/main>/gi, '$1')
                .replace(/( style=")(.*?)(")/gi, '')
                .replace(/(<span>)(.*?)(<\/span>)/gi, '$2')
                .replace(/(<main>)(.*?)(<\/main>)/gi, '$2')
            : '',
      type: typeOfPost(module.metadata),
    }))
    .filter((post, index) => (!filterUnlisted || !post.flags?.includes('unlisted')) && (!postLimit || index < postLimit))
    .map((post): Urara.Post => post as Urara.Post)
    .sort((a, b) => {
      const dateA = a.created ? new Date(a.created).getTime() : 0
      const dateB = b.created ? new Date(b.created).getTime() : 0
      return dateB - dateA
    })

export const genTags: GenTagsFunction = posts => [
  ...new Set(posts.reduce((acc, posts) => (posts.tags ? [...acc, ...posts.tags] : acc), ['']).slice(1)),
]
