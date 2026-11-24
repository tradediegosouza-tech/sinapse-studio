import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configurado, supabase } from './lib/supabase'
import Entrar from './telas/Entrar'
import Painel from './telas/Painel'

export default function App() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(configurado)

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <div className="pagina">
      <header className="topo">
        <span className="marca">Sinapse <b>Studio</b></span>
        {sessao && (
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        )}
      </header>
      <main>
        {!configurado ? (
          <section className="cartao">
            <h1>Falta a chave pública</h1>
            <p>Defina VITE_SUPABASE_ANON_KEY (veja o arquivo .env.example).</p>
          </section>
        ) : carregando ? (
          <p className="aviso">Carregando…</p>
        ) : sessao ? (
          <Painel email={sessao.user.email ?? ''} />
        ) : (
          <Entrar />
        )}
      </main>
      <footer className="rodape">
        Vídeos feitos com IA. Você revisa e aprova antes de publicar.
      </footer>
    </div>
  )
}
