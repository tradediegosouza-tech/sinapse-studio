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
  objetivo: string
  legenda: string
  erro: string
  aprovado: boolean
  ajuste: string
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
      objetivo: txt(r.objetivo),
      legenda: txt(r.legenda),
      erro: txt(r.erro),
      aprovado: Boolean(r.aprovado_em),
      ajuste: txt(r.ajuste_pedido),
    }))
    .sort((a, b) => (b.criado ?? '').localeCompare(a.criado ?? ''))
}

// Confere assinatura e saldo e gasta 1 crédito, tudo dentro do banco.
// Se a migração 002 ainda não rodou (função nova não existe), usa a função antiga.
export async function pedirReel(tema: string, tom: string, objetivo: string) {
  const novo = await supabase.rpc('pedir_reel_completo', {
    p_tema: tema, p_tom: tom, p_objetivo: objetivo, p_formato: FORMATO,
  })
  if (!novo.error) return
  if (novo.error.code !== 'PGRST202') throw novo.error
  const { error } = await supabase.rpc('pedir_reel', { p_tema: tema, p_tom: tom })
  if (error) throw error
}

// Único formato que a fábrica produz hoje.
export const FORMATO = 'Reel narrado com cenas (25 a 35 s)'

export async function aprovarReel(id: string) {
  const { error } = await supabase.rpc('aprovar_reel', { p_id: Number(id) })
  if (error) throw error
}

export async function pedirAjuste(id: string, texto: string) {
  const { error } = await supabase.rpc('pedir_ajuste', { p_id: Number(id), p_texto: texto })
  if (error) throw error
}

export async function salvarPerfil(id: unknown, campos: { nome: string; profissao: string; registro: string }) {
  const { error } = await supabase.from('clientes').update(campos).eq('id', id)
  if (error) throw error
}

export function mensagemDeErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? ''
  const codigo = (e as { code?: string })?.code ?? ''
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m))
    return 'Sem conexão com a internet. Confira e tente de novo.'
  if (codigo === 'PGRST301' || /jwt|token.*expir/i.test(m)) return 'Sua sessão venceu. Saia e entre de novo.'
  if (codigo === 'PGRST202') return 'Esta função ainda não está disponível.'
  if (/saldo|cr[eé]dito/i.test(m)) return 'Você não tem créditos sobrando neste mês.'
  if (/assinatura/i.test(m)) return 'Sua assinatura não está ativa.'
  // Mensagens escritas por nós no banco vêm em português; o resto não vai cru para a cliente.
  if (/[áàâãéêíóôõúç]/i.test(m) || /^(Este|Conte|Faça)/.test(m)) return m
  return 'Algo deu errado. Tente de novo em instantes.'
}

// Datas sem hora ("2026-12-24") são do calendário, não de um fuso: sem isto o Brasil vê o dia anterior.
export function dataBR(v: string | null): string {
  if (!v) return ''
  const so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  const d = so ? new Date(Number(so[1]), Number(so[2]) - 1, Number(so[3])) : new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

// Baixa o vídeo de verdade (o atributo "download" não vale para arquivo de outro site).
// Devolve false se o navegador não deixar: aí a tela mostra o link para abrir.
export async function baixarVideo(url: string, tema: string): Promise<boolean> {
  try {
    const r = await fetch(url)
    if (!r.ok) return false
    const endereco = URL.createObjectURL(await r.blob())
    const nome = tema.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const a = document.createElement('a')
    a.href = endereco
    a.download = `reel-${nome || 'sinapse'}.mp4`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(endereco), 60000)
    return true
  } catch {
    return false
  }
}

export async function copiarTexto(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    return false
  }
}
