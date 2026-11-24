import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://zjsqtzqrwdktdcsinbcs.supabase.co'
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Link de acesso vencido ou já usado: o Supabase devolve o erro no endereço (#error=...).
// Lemos antes de criar o cliente e limpamos o endereço, para a tela de entrada poder explicar.
function lerErroDoLink(): string {
  const bruto = window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, '')
  const p = new URLSearchParams(bruto)
  if (!p.get('error') && !p.get('error_code')) return ''
  window.history.replaceState(null, '', window.location.pathname)
  return p.get('error_code') === 'otp_expired'
    ? 'Esse acesso já foi usado ou venceu. Peça um código novo aqui embaixo.'
    : 'Não consegui entrar por esse e-mail. Peça um código novo aqui embaixo.'
}
export const erroDoLink = lerErroDoLink()

export const configurado = Boolean(chave)
// Sem a chave pública o app abre só a tela de aviso (não quebra).
export const supabase = createClient(url, chave || 'sem-chave')
