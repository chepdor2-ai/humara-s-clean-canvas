import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Humara',
    short_name: 'Humara',
    description: 'Humara AI humanizer and detector workspace.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f4ef',
    theme_color: '#343562',
    icons: [
      {
        src: '/icon.png',
        sizes: '256x256',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}