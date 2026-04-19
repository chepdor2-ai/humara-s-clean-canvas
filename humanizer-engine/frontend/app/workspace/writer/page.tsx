import type { Metadata } from 'next'
import { WriterClient } from './writer-client'

export const metadata: Metadata = {
  title: 'Writer — Humara Workspace',
  description:
    'Academic writer with a chat on the left and a Word-like document on the right. Cite real sources from OpenAlex, insert tables and charts, export to .docx or PDF.',
}

export default function WriterPage() {
  return <WriterClient />
}
