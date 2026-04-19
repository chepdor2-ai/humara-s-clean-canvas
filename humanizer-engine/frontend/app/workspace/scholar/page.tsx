import type { Metadata } from 'next'
import { ScholarClient } from './scholar-client'

export const metadata: Metadata = {
  title: 'Scholar — Humara Workspace',
  description:
    'Search real scholarly works from OpenAlex. Filter by year, journal, author, and open access. Copy citations in APA, MLA, Chicago, Harvard, IEEE, BibTeX, RIS, and more.',
}

export default function ScholarPage() {
  return <ScholarClient />
}
