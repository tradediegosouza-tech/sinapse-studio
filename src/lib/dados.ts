import { supabase } from './supabase'

// Todo acesso ao banco passa por aqui. A cliente só lê o que é dela (RLS).
export type Linha = Record<string, unknown>

export type Reel = {
  id: string
  tema: string
  tom: string
  status: 'na_fila' | 'produzindo' | 'pronto' | 'erro' | string
  video_url: string | null
  criado: string | null
}

const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

export async function lerCliente(): Promise<Linha | null> {
  const { data, error } = await supabase.from('clientes').select('*').limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function lerSaldo(): Promise<number> {
  const { data, error } = await supabase.rpc('saldo_creditos')
  if (error) throw error
  return Number(data ?? 0)
}

export async function lerReels(): Promise<Reel[]> {
  const { data, error } = await supabase.from('reels').select('*')
  if (error) throw error
  return (data ?? [])
    .map((r: Linha) => ({
      id: txt(r.id),
      tema: txt(r.tema),
      tom: txt(r.tom),
      status: txt(r.status),
      video_url: r.video_url ? txt(r.video_url) : null,
      criado: txt(r.criado_em ?? r.created_at) || null,
    }))
    .sort((a, b) => (b.criado ?? '').localeCompare(a.criado ?? ''))
}

// Confere assinatura e saldo e gasta 1 crédito, tudo dentro do banco.
export async function pedirReel(tema: string, tom: string) {
  const { error } = await supabase.rpc('pedir_reel', { p_tema: tema, p_tom: tom })
  if (error) throw error
}

export async function salvarPerfil(id: unknown, campos: { nome: string; profissao: string; registro: string }) {
  const { error } = await supabase.from('clientes').update(campos).eq('id', id)
  if (error) throw error
}

export function mensagemDeErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? ''
  if (/saldo|cr[eé]dito/i.test(m)) return 'Você não tem créditos sobrando neste mês.'
  if (/assinatura|ativa/i.test(m)) return 'Sua assinatura não está ativa.'
  return m || 'Algo deu errado. Tente de novo em instantes.'
}
