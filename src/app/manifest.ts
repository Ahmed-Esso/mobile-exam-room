import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Exam Room',
    short_name: 'Exam Room',
    description: 'Live multiplayer exams on your phones, with answer tags, reactions and a podium.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0f13',
    theme_color: '#0e0f13',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
