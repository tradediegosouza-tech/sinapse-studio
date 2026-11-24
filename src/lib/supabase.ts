import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://zjsqtzqrwdktdcsinbcs.supabase.co'
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(chave)
// Sem a chave pública o app abre só a tela de aviso (não quebra).
export const supabase = createClient(url, chave || 'sem-chave')
