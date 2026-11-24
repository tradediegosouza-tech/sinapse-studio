import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  aprovarReel, FORMATO, lerCliente, lerReels, lerSaldo, mensagemDeErro, pedirAjuste, pedirReel, salvarPerfil,
  type Linha, type Reel,
} from '../lib/dados'

const TONS = ['Acolhedor', 'Didático', 'Direto', 'Inspirador']
const OBJETIVOS = ['Explicar um tema', 'Desfazer um mito', 'Acolher quem passa por isso', 'Apresentar meu trabalho']
const ROTULO: Record<string, string> = {
  na_fila: 'Na fila',
  produzindo: 'Produzindo',
  pronto: 'Pronto',
  erro: 'Não deu certo',
}
const txt = (v: unknown) => (typeof v === 'string' ? v : '')

export default function Painel({ email }: { email: string }) {
  const [cliente, setCliente] = useState<Linha | null>(null)
  const [saldo, setSaldo] = useState(0)
  const [reels, setReels] = useState<Reel[]>([])
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      const c = await lerCliente()
      setCliente(c)
      if (c) {
        const [s, r] = await Promise.all([lerSaldo(), lerReels()])
        setSaldo(s)
        setReels(r)
      }
      setErro('')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setPronto(true)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Enquanto houver Reel em produção, confere de novo a cada 15 s.
  const emProducao = reels.some((r) => r.status === 'na_fila' || r.status === 'produzindo')
  useEffect(() => {
    if (!emProducao) return
    const t = setInterval(carregar, 15000)
    return () => clearInterval(t)
  }, [emProducao, carregar])

  if (!pronto) return <p className="aviso">Carregando…</p>

  if (!cliente)
    return (
      <section className="cartao centro">
        <h1>Não achamos sua assinatura</h1>
        <p>
          Você entrou com <b>{email}</b>. Use o mesmo e-mail da compra. Se acabou de pagar,
          aguarde alguns minutos e atualize a página.
        </p>
        {erro && <p className="erro">{erro}</p>}
        <button className="botao" onClick={carregar}>Atualizar</button>
      </section>
    )

  const status = txt(cliente.status)
  const ativa = status === 'ativa'
  const renova = txt(cliente.renova_em)

  return (
    <>
      <section className="cartao saldo">
        <div>
          <p className="rotulo">Olá{txt(cliente.nome) ? `, ${txt(cliente.nome).split(' ')[0]}` : ''}</p>
          <p className="numero">{saldo}</p>
          <p>{saldo === 1 ? 'crédito disponível' : 'créditos disponíveis'} · 1 crédito = 1 Reel</p>
        </div>
        <div className="direita">
          <span className={`selo ${ativa ? 'ok' : 'alerta'}`}>Assinatura {status || 'sem status'}</span>
          {renova && <p className="pequeno">Renova em {new Date(renova).toLocaleDateString('pt-BR')}</p>}
        </div>
      </section>

      {erro && <p className="erro">{erro}</p>}

      <NovoReel podeCriar={ativa && saldo > 0} ativa={ativa} aoCriar={carregar} />

      <section className="cartao">
        <h2>Seus Reels</h2>
        {reels.length === 0 ? (
          <p className="aviso">Você ainda não criou nenhum Reel.</p>
        ) : (
          <ul className="lista">
            {reels.map((r) => (
              <ItemReel key={r.id} r={r} aoMudar={carregar} />
            ))}
          </ul>
        )}
      </section>

      <Perfil cliente={cliente} aoSalvar={carregar} />
    </>
  )
}

function ItemReel({ r, aoMudar }: { r: Reel; aoMudar: () => void }) {
  const [ajustando, setAjustando] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const pronto = r.status === 'pronto' && r.video_url

  async function agir(acao: () => Promise<void>) {
    setErro('')
    try {
      await acao()
      setAjustando(false)
      aoMudar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  return (
    <li className="reel">
      <div className="cabeca">
        <div>
          <b>{r.tema}</b>
          <p className="pequeno">
            {[r.objetivo, r.tom, r.criado && new Date(r.criado).toLocaleDateString('pt-BR')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={`selo ${r.status === 'erro' ? 'alerta' : r.aprovado ? 'ok' : 'espera'}`}>
          {r.aprovado ? 'Aprovado' : pronto ? 'Para revisar' : r.ajuste && r.status !== 'erro' ? 'Em ajuste' : (ROTULO[r.status] ?? r.status)}
        </span>
      </div>

      {r.status === 'erro' && (
        <p className="pequeno">Não conseguimos gerar este Reel. O crédito voltou para o seu saldo.</p>
      )}

      {pronto && (
        <>
          <video className="previa" src={r.video_url!} controls playsInline preload="metadata" />
          {r.legenda && (
            <div className="legenda">
              <p>{r.legenda}</p>
              <button
                className="link"
                onClick={() => navigator.clipboard.writeText(r.legenda).then(() => setCopiado(true))}
              >
                {copiado ? 'Legenda copiada' : 'Copiar legenda'}
              </button>
            </div>
          )}
          {erro && <p className="erro">{erro}</p>}
          {r.aprovado ? (
            <a className="botao" href={r.video_url!} target="_blank" rel="noreferrer" download>
              Baixar vídeo
            </a>
          ) : ajustando ? (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                agir(() => pedirAjuste(r.id, texto))
              }}
            >
              <label htmlFor={`aj${r.id}`}>O que você quer ajustar?</label>
              <textarea id={`aj${r.id}`} required minLength={5} maxLength={500} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
              <div className="acoes">
                <button className="botao">Enviar ajuste</button>
                <button type="button" className="botao secundario" onClick={() => setAjustando(false)}>Voltar</button>
              </div>
            </form>
          ) : (
            <div className="acoes">
              <button className="botao" onClick={() => agir(() => aprovarReel(r.id))}>Aprovar</button>
              {!r.ajuste && (
                <button className="botao secundario" onClick={() => setAjustando(true)}>Pedir ajuste</button>
              )}
            </div>
          )}
          {!r.aprovado && (
            <p className="pequeno">
              {r.ajuste ? 'Este Reel já teve o ajuste incluído. ' : 'Você tem 1 ajuste por Reel. '}
              Revise o conteúdo antes de aprovar: a publicação é sua.
            </p>
          )}
        </>
      )}
    </li>
  )
}

function NovoReel({ podeCriar, ativa, aoCriar }: { podeCriar: boolean; ativa: boolean; aoCriar: () => void }) {
  const [tema, setTema] = useState('')
  const [tom, setTom] = useState(TONS[0])
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0])
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setMsg('')
    setEnviando(true)
    try {
      await pedirReel(tema.trim(), tom, objetivo)
      setTema('')
      setMsg('Pedido recebido. Seu Reel entrou na fila.')
      aoCriar()
    } catch (er) {
      setErro(mensagemDeErro(er))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>Criar um Reel</h2>
      <form onSubmit={criar}>
        <label htmlFor="tema">Sobre o que é o Reel?</label>
        <textarea
          id="tema"
          required
          minLength={5}
          maxLength={300}
          rows={3}
          placeholder="Ex.: 3 sinais de que a ansiedade está pedindo atenção"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
        />
        <label htmlFor="objetivo">Objetivo do conteúdo</label>
        <select id="objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
          {OBJETIVOS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <label htmlFor="tom">Tom</label>
        <select id="tom" value={tom} onChange={(e) => setTom(e.target.value)}>
          {TONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <p className="pequeno">Formato: {FORMATO}, com o seu nome na tela.</p>
        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="sucesso">{msg}</p>}
        <button className="botao" disabled={!podeCriar || enviando}>
          {enviando ? 'Enviando…' : 'Criar Reel (usa 1 crédito)'}
        </button>
        {!podeCriar && (
          <p className="pequeno">
            {ativa ? 'Seus créditos deste mês acabaram.' : 'Sua assinatura precisa estar ativa para criar Reels.'}
          </p>
        )}
      </form>
    </section>
  )
}

function Perfil({ cliente, aoSalvar }: { cliente: Linha; aoSalvar: () => void }) {
  const [nome, setNome] = useState(txt(cliente.nome))
  const [profissao, setProfissao] = useState(txt(cliente.profissao))
  const [registro, setRegistro] = useState(txt(cliente.registro))
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    setErro('')
    try {
      await salvarPerfil(cliente.id, { nome: nome.trim(), profissao: profissao.trim(), registro: registro.trim() })
      setMsg('Dados salvos.')
      aoSalvar()
    } catch (er) {
      setErro(mensagemDeErro(er))
    }
  }

  return (
    <section className="cartao">
      <h2>Como seu nome aparece no Reel</h2>
      <form onSubmit={salvar}>
        <label htmlFor="nome">Nome</label>
        <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <label htmlFor="profissao">Profissão</label>
        <input id="profissao" placeholder="Ex.: Psicóloga" value={profissao} onChange={(e) => setProfissao(e.target.value)} />
        <label htmlFor="registro">Registro (se tiver)</label>
        <input id="registro" placeholder="Ex.: CRP 06/000000" value={registro} onChange={(e) => setRegistro(e.target.value)} />
        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="sucesso">{msg}</p>}
        <button className="botao secundario">Salvar</button>
      </form>
    </section>
  )
}
