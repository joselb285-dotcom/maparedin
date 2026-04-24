import { supabase } from './supabase'
import type { Project } from './types'

export async function dbGetAllProjects(tenantId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('data')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return (data ?? []).map(row => row.data as Project)
}

export async function dbSaveProject(project: Project, tenantId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('projects')
    .upsert({ id: project.id, tenant_id: tenantId, owner_id: user!.id, data: project })
  if (error) throw error
}

export async function dbDeleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
