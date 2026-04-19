import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function getUserFromAuth(authHeader: string | null) {
  if (!authHeader) return null
  return authHeader.replace('Bearer ', '')
}

export async function requireWorkspaceUser(request: Request) {
  const token = getUserFromAuth(request.headers.get('authorization'))
  if (!token) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabase = createServiceClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { supabase, user, error: null }
}
