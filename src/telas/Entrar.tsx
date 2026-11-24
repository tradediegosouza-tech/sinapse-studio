import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'enviado'>('parado')
  const [erro, setErro] = useState('')

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEstado('enviando')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Só entra quem já é cliente: o cadastro nasce no pagamento.
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    })
    if (error) {
      setErro(
        /signups? not allowed|not found/i.test(error.message)
          ? 'Não achamos uma assinatura com esse e-mail. Use o mesmo e-mail da compra.'
          : 'Não consegui enviar o link. Confira o e-mail e tente de novo.',
      )
      setEstado('parado')
    } else setEstado('enviado')
  }

  if (estado === 'enviado')
    return (
      <section className="cartao centro">
        <h1>Olhe o seu e-mail</h1>
        <p>
          Enviamos um link para <b>{email}</b>. Toque nele para entrar. Não precisa de senha.
        </p>
        <button className="link" onClick={() => setEstado('parado')}>
          Usar outro e-mail
        </button>
      </section>
    )

  return (
    <section className="cartao centro">
      <h1>Entre no seu Studio</h1>
      <p>Use o e-mail da sua compra. Você recebe um link para entrar, sem senha.</p>
      <form onSubmit={enviar}>
        <label htmlFor="email">Seu e-mail</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {erro && <p className="erro">{erro}</p>}
        <button className="botao" disabled={estado === 'enviando'}>
          {estado === 'enviando' ? 'Enviando…' : 'Receber link de acesso'}
        </button>
      </form>
    </section>
  )
}
