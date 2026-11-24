import { useEffect, useState, type FormEvent } from 'react'
import { erroDoLink, supabase } from '../lib/supabase'

const ESPERA = 60 // o Supabase só deixa pedir outro link depois de 60 s

function traduzir(error: { message: string; status?: number; code?: string; name?: string }): string {
  if (error.code === 'otp_disabled' || /signups? not allowed|not found/i.test(error.message))
    return 'Não achamos uma assinatura com esse e-mail. Use o mesmo e-mail da compra.'
  if (error.status === 429 || /rate limit|after \d+ seconds/i.test(error.message))
    return 'Você pediu um link há pouco. Espere 1 minuto e tente de novo.'
  if (error.name === 'AuthRetryableFetchError' || !error.status || /fetch/i.test(error.message))
    return 'Sem conexão com a internet. Confira e tente de novo.'
  if (/invalid.*email|email.*invalid/i.test(error.message)) return 'Esse e-mail parece ter um erro de digitação.'
  return 'Não consegui enviar o link agora. Tente de novo em instantes.'
}

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [tela, setTela] = useState<'pedir' | 'enviado'>('pedir')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(erroDoLink)
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function pedirLink() {
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Só entra quem já é cliente: o cadastro nasce no pagamento.
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    })
    setEnviando(false)
    if (error) setErro(traduzir(error))
    else {
      setEspera(ESPERA)
      setTela('enviado')
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    pedirLink()
  }

  if (tela === 'enviado')
    return (
      <section className="cartao centro">
        <h1>Olhe o seu e-mail</h1>
        <p>
          Enviamos um link para <b>{email.trim().toLowerCase()}</b>. Toque nele para entrar. Não precisa de senha.
        </p>
        <p className="pequeno">
          Pode levar 1 ou 2 minutos. Se não achar, olhe a caixa de spam ou promoções. O link vale por pouco tempo e só
          funciona uma vez.
        </p>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao secundario" disabled={espera > 0 || enviando} onClick={pedirLink}>
          {enviando ? 'Enviando…' : espera > 0 ? `Enviar de novo em ${espera} s` : 'Enviar de novo'}
        </button>
        <p>
          <button className="link" onClick={() => { setErro(''); setTela('pedir') }}>
            Usar outro e-mail
          </button>
        </p>
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
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Receber link de acesso'}
        </button>
      </form>
    </section>
  )
}
