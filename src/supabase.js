import { createClient } from '@supabase/supabase-js'

// A URL e a chave "anon" são públicas por natureza: quem protege os dados é o RLS
// (cada cliente só lê o que é dela). Nunca colocar a chave service_role aqui.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://zjsqtzqrwdktdcsinbcs.supabase.co'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(anonKey)

export const supabase = configurado
  ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } })
  : null
