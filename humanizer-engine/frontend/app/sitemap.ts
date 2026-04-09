import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://humaragpt.com';
  const routes = ['', '/detector', '/pricing', '/about', '/contact', '/how-it-works', '/privacy', '/terms', '/acceptable-use'];
  return routes.map((route) => ({
    url: `${base}${route || '/'}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: route === '' ? 1 : 0.7,
  }));
}
