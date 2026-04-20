import { ScholarSearch } from '@/components/workspace/ScholarSearch'

export const metadata = {
  title: 'Scholar Search | Humara Workspace',
  description: 'Search hundreds of millions of scholarly articles globally.',
}

export default function ScholarPage() {
  return (
    <div className="h-[calc(100vh-64px)] w-full overflow-hidden">
      <ScholarSearch />
    </div>
  )
}
