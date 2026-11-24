import { useCallback, useEffect, useState } from 'react'
import { supabase, configurado } from './supabase'

const TONS = ['Acolhedor', 'Educativo', 'Inspirador', 'Direto']
const SUGESTOES = [
  'Ansiedade no dia a dia',
  'Como funciona a primeira sessão',
  'Autoestima e autocrítica',
  'Limites saudáveis no trabalho',
]
const STATUS = {
  na_fila: { rotulo: 'Na fila', classe: 'fila' },
  produzindo: { rotulo: 'Produzindo', classe: 'produzindo' },
  pronto: { rotulo: 'Pronto', classe: 'pronto' },
  erro: { rotulo: 'Não deu certo', classe: 'erro' },
}

function traduzErro(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('signup') || m.includes('not allowed') || m.includes('user not found'))
    return 'Esse e-mail ainda não tem assinatura do Sinapse Studio. Use o mesmo e-mail da compra.'
  if (m.includes('rate') || m.includes('seconds'))
    return 'Muitos pedidos seguidos. Espere 1 minuto e tente de novo.'
  if (m.includes('saldo') || m.includes('credito') || m.includes('crédito'))
    return 'Seus créditos deste mês acabaram.'
  if (m.includes('assinatura') || m.includes('ativa'))
    return 'Sua assinatura não está ativa no momento.'
  return msg || 'Algo deu errado. Tente de novo.'
}

const dataBR = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''

/* ---------- Entrar (link no e-mail, sem senha) ---------- */
function Entrar() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState('livre') // livre | enviando | enviado
  const [erro, setErro] = useState('')

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setEstado('enviando')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false, // só entra quem comprou (o cadastro nasce no pagamento)
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    if (error) {
      setErro(traduzErro(error.message))
      setEstado('livre')
    } else setEstado('enviado')
  }

  return (
    <div className="entrar">
      <div className="entrar-cartao">
        <Marca />
        {estado === 'enviado' ? (
          <>
            <h1>Confira seu e-mail</h1>
            <p className="suave">
              Mandamos um link de acesso para <b>{email}</b>. Abra no mesmo aparelho e você entra direto.
            </p>
            <button className="link" onClick={() => setEstado('livre')}>Usar outro e-mail</button>
          </>
        ) : (
          <form onSubmit={enviar}>
            <h1>Seus Reels, prontos.</h1>
            <p className="suave">Entre com o e-mail da sua assinatura. Sem senha: enviamos um link.</p>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {erro && <p className="aviso-erro">{erro}</p>}
            <button className="primario" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Receber link de acesso'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Marca() {
  return (
    <div className="marca">
      <span className="marca-ponto" aria-hidden="true" />
      Sinapse <em>Studio</em>
    </div>
  )
}

/* ---------- Criar Reel ---------- */
function CriarReel({ saldo, ativa, aoCriar }) {
  const [tema, setTema] = useState('')
  const [tom, setTom] = useState(TONS[0])
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)
  const bloqueado = !ativa || saldo < 1

  async function pedir(e) {
    e.preventDefault()
    if (!tema.trim()) return
    setEnviando(true)
    setMsg(null)
    const { error } = await supabase.rpc('pedir_reel', { p_tema: tema.trim(), p_tom: tom })
    setEnviando(false)
    if (error) return setMsg({ tipo: 'erro', texto: traduzErro(error.message) })
    setTema('')
    setMsg({ tipo: 'ok', texto: 'Pedido recebido. Ele aparece em "Meus Reels" e muda para Pronto quando terminar.' })
    aoCriar()
  }

  return (
    <section className="cartao">
      <h2>Criar um Reel</h2>
      <form onSubmit={pedir}>
        <label htmlFor="tema">Sobre o que é o Reel?</label>
        <textarea
          id="tema"
          rows={3}
          maxLength={200}
          placeholder="Ex.: 3 sinais de que a ansiedade está passando do ponto"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          disabled={bloqueado}
        />
        <div className="chips">
          {SUGESTOES.map((s) => (
            <button type="button" key={s} className="chip" onClick={() => setTema(s)} disabled={bloqueado}>
              {s}
            </button>
          ))}
        </div>
        <label>Tom</label>
        <div className="tons" role="radiogroup">
          {TONS.map((t) => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={tom === t}
              className={tom === t ? 'tom ativo' : 'tom'}
              onClick={() => setTom(t)}
              disabled={bloqueado}
            >
              {t}
            </button>
          ))}
        </div>
        {msg && <p className={msg.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}>{msg.texto}</p>}
        <button className="primario" disabled={bloqueado || enviando || !tema.trim()}>
          {enviando ? 'Enviando…' : 'Criar Reel · usa 1 crédito'}
        </button>
        {!ativa && <p className="suave pequeno">Sua assinatura não está ativa, por isso não dá para criar agora.</p>}
        {ativa && saldo < 1 && <p className="suave pequeno">Seus créditos deste mês acabaram.</p>}
      </form>
    </section>
  )
}

/* ---------- Meus Reels ---------- */
function MeusReels({ reels }) {
  return (
    <section className="cartao">
      <h2>Meus Reels</h2>
      {reels.length === 0 && <p className="suave">Nenhum Reel ainda. Crie o primeiro aí em cima.</p>}
      <ul className="lista">
        {reels.map((r) => {
          const s = STATUS[r.status] || { rotulo: r.status, classe: 'fila' }
          return (
            <li key={r.id} className="reel">
              <div className="reel-topo">
                <div>
                  <p className="reel-tema">{r.tema}</p>
                  <p className="suave pequeno">
                    {r.tom ? `${r.tom} · ` : ''}
                    {dataBR(r.criado_em)}
                  </p>
                </div>
                <span className={`selo ${s.classe}`}>{s.rotulo}</span>
              </div>
              {r.status === 'pronto' && r.video_url && (
                <div className="reel-video">
                  <video src={r.video_url} controls playsInline preload="metadata" />
                  <a className="secundario" href={r.video_url} download target="_blank" rel="noreferrer">
                    Baixar vídeo
                  </a>
                </div>
              )}
              {r.status === 'erro' && (
                <p className="aviso-erro pequeno">Esse Reel não saiu. Fale com a gente pelo suporte que resolvemos.</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ---------- Perfil ---------- */
function Perfil({ cliente, aoSalvar }) {
  const [form, setForm] = useState({
    nome: cliente.nome || '',
    profissao: cliente.profissao || '',
    registro: cliente.registro || '',
  })
  const [salvo, setSalvo] = useState('')

  async function salvar(e) {
    e.preventDefault()
    setSalvo('')
    const { error } = await supabase.from('clientes').update(form).eq('id', cliente.id)
    setSalvo(error ? traduzErro(error.message) : 'Salvo.')
    if (!error) aoSalvar()
  }
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  return (
    <section className="cartao">
      <h2>Seus dados no vídeo</h2>
      <p className="suave pequeno">Seu nome e registro aparecem nos Reels, como o conselho da sua profissão pede.</p>
      <form onSubmit={salvar} className="grade">
        <div>
          <label htmlFor="nome">Nome</label>
          <input id="nome" {...campo('nome')} placeholder="Como aparece no vídeo" />
        </div>
        <div>
          <label htmlFor="profissao">Profissão</label>
          <input id="profissao" {...campo('profissao')} placeholder="Ex.: Psicóloga" />
        </div>
        <div>
          <label htmlFor="registro">Registro</label>
          <input id="registro" {...campo('registro')} placeholder="Ex.: CRP 06/000000" />
        </div>
        <div className="grade-acao">
          <button className="secundario">Salvar</button>
          {salvo && <span className="suave pequeno">{salvo}</span>}
        </div>
      </form>
    </section>
  )
}

/* ---------- Painel ---------- */
function Painel({ sessao }) {
  const [cliente, setCliente] = useState(undefined) // undefined = carregando, null = não achou
  const [saldo, setSaldo] = useState(0)
  const [reels, setReels] = useState([])

  const carregar = useCallback(async () => {
    const [c, s, r] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', sessao.user.id).maybeSingle(),
      supabase.rpc('saldo_creditos'),
      supabase.from('reels').select('*').order('criado_em', { ascending: false }),
    ])
    setCliente(c.data ?? null)
    setSaldo(s.data ?? 0)
    setReels(r.data ?? [])
  }, [sessao.user.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Enquanto houver Reel na fila/produzindo, atualiza a cada 20 s.
  useEffect(() => {
    const pendente = reels.some((r) => r.status === 'na_fila' || r.status === 'produzindo')
    if (!pendente) return
    const t = setInterval(carregar, 20000)
    return () => clearInterval(t)
  }, [reels, carregar])

  const sair = () => supabase.auth.signOut()

  if (cliente === undefined) return <div className="carregando">Carregando…</div>

  if (cliente === null)
    return (
      <div className="entrar">
        <div className="entrar-cartao">
          <Marca />
          <h1>Quase lá</h1>
          <p className="suave">
            Você entrou com <b>{sessao.user.email}</b>, mas ainda não achamos uma assinatura do Studio nesse e-mail.
            Se acabou de pagar, espere alguns minutos e recarregue.
          </p>
          <button className="link" onClick={sair}>Sair</button>
        </div>
      </div>
    )

  const ativa = cliente.status === 'ativa'
  return (
    <div className="app">
      <header className="topo">
        <Marca />
        <button className="link" onClick={sair}>Sair</button>
      </header>

      <section className="resumo">
        <div>
          <p className="suave pequeno">Olá{cliente.nome ? `, ${cliente.nome.split(' ')[0]}` : ''}</p>
          <p className="saldo">
            <span>{saldo}</span> {saldo === 1 ? 'crédito' : 'créditos'}
          </p>
          <p className="suave pequeno">
            1 crédito = 1 Reel · {cliente.creditos_por_mes} por mês
            {cliente.renova_em ? ` · renova em ${dataBR(cliente.renova_em)}` : ''}
          </p>
        </div>
        <span className={`selo ${ativa ? 'pronto' : 'erro'}`}>{ativa ? 'Assinatura ativa' : `Assinatura ${cliente.status}`}</span>
      </section>

      <CriarReel saldo={saldo} ativa={ativa} aoCriar={carregar} />
      <MeusReels reels={reels} />
      <Perfil cliente={cliente} aoSalvar={carregar} />

      <footer className="rodape suave pequeno">
        Os Reels seguem as regras de publicidade do seu conselho profissional. Revise sempre antes de postar.
      </footer>
    </div>
  )
}

export default function App() {
  const [sessao, setSessao] = useState(undefined)

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configurado)
    return (
      <div className="entrar">
        <div className="entrar-cartao">
          <Marca />
          <h1>Falta a chave</h1>
          <p className="suave">Defina VITE_SUPABASE_ANON_KEY (veja o README).</p>
        </div>
      </div>
    )
  if (sessao === undefined) return <div className="carregando">Carregando…</div>
  return sessao ? <Painel sessao={sessao} /> : <Entrar />
}
