import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from './blog/data';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://humaragpt.com';
  const routes = ['', '/detector', '/pricing', '/about', '/contact', '/how-it-works', '/blog', '/privacy', '/terms', '/acceptable-use'];
  const pages: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${base}${route || '/'}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : route === '/blog' ? 0.9 : 0.7,
  }));

  const blogPages: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [...pages, ...blogPages];
}
