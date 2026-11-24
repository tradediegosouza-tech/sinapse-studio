import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  aprovarReel, baixarVideo, copiarTexto, dataBR, FORMATO, lerCliente, lerReels, lerSaldo, mensagemDeErro,
  pedirAjuste, pedirReel, salvarPerfil,
  type Linha, type Reel,
} from '../lib/dados'

// Jeitos de falar inspirados nos arquétipos de marca (Mark e Pearson). O valor vai para a fábrica no campo "tom".
const VOZES = [
  { nome: 'Cuidadora', tom: 'acolhedor', frase: 'Acolhe quem está passando por isso, sem julgar.' },
  { nome: 'Sábia', tom: 'didático', frase: 'Explica o tema com calma e clareza.' },
  { nome: 'Gente como a gente', tom: 'simples e próximo', frase: 'Fala simples, com cenas do dia a dia.' },
  { nome: 'Exploradora', tom: 'reflexivo', frase: 'Faz perguntas que convidam a pensar.' },
  { nome: 'Heroína', tom: 'encorajador', frase: 'Dá coragem para o primeiro passo, sem prometer resultado.' },
]
const TONS = VOZES.map((v) => `${v.nome} (${v.tom})`)
const OBJETIVOS = ['Explicar um tema', 'Desfazer um mito', 'Acolher quem passa por isso', 'Apresentar meu trabalho']
const ROTULO: Record<string, string> = {
  na_fila: 'Na fila',
  produzindo: 'Produzindo',
  pronto: 'Pronto',
  erro: 'Não deu certo',
}
const ASSINATURA: Record<string, string> = {
  ativa: 'Assinatura ativa',
  pausada: 'Assinatura pausada',
  cancelada: 'Assinatura cancelada',
  inadimplente: 'Pagamento pendente',
}
const SEM_CRIAR: Record<string, string> = {
  pausada: 'Sua assinatura está pausada. Seus Reels prontos continuam aqui para ver e baixar.',
  cancelada: 'Sua assinatura foi cancelada. Seus Reels prontos continuam aqui para ver e baixar.',
  inadimplente: 'Seu pagamento está pendente. Assim que ele for confirmado, você volta a criar Reels.',
}
const TEMA_MAX = 300
const txt = (v: unknown) => (typeof v === 'string' ? v : '')

export default function Painel({ email }: { email: string }) {
  const [cliente, setCliente] = useState<Linha | null>(null)
  const [saldo, setSaldo] = useState(0)
  const [reels, setReels] = useState<Reel[]>([])
  // 'falhou' = nunca conseguiu ler. Não é o mesmo que "não é cliente".
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'falhou'>('carregando')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      const c = await lerCliente()
      if (c) {
        const [s, r] = await Promise.all([lerSaldo(), lerReels()])
        setSaldo(s)
        setReels(r)
      }
      setCliente(c)
      setErro('')
      setEstado('ok')
    } catch (e) {
      // Falha no meio do uso: mantém o que já estava na tela e só avisa.
      setErro(mensagemDeErro(e))
      setEstado((antes) => (antes === 'ok' ? 'ok' : 'falhou'))
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Voltou para a aba (ou destravou o celular): confere de novo.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') carregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [carregar])

  // Enquanto houver Reel em produção, confere de novo a cada 15 s (só com a aba à vista).
  const emProducao = reels.some((r) => r.status === 'na_fila' || r.status === 'produzindo')
  useEffect(() => {
    if (!emProducao) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') carregar()
    }, 15000)
    return () => clearInterval(t)
  }, [emProducao, carregar])

  if (estado === 'carregando') return <p className="aviso">Carregando…</p>

  if (estado === 'falhou')
    return (
      <section className="cartao centro">
        <h1>Não consegui carregar seus dados</h1>
        <p className="erro" role="alert">{erro}</p>
        <button className="botao" onClick={() => { setEstado('carregando'); carregar() }}>
          Tentar de novo
        </button>
      </section>
    )

  if (!cliente)
    return (
      <section className="cartao centro">
        <h1>Não achamos sua assinatura</h1>
        <p>
          Você entrou com <b>{email}</b>. Use o mesmo e-mail da compra. Se acabou de pagar,
          aguarde alguns minutos e atualize a página.
        </p>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao" onClick={carregar}>Atualizar</button>
      </section>
    )

  const status = txt(cliente.status)
  const ativa = status === 'ativa'
  const renova = dataBR(txt(cliente.renova_em) || null)

  return (
    <>
      <section className="cartao saldo">
        <div>
          <p className="rotulo">Olá{txt(cliente.nome) ? `, ${txt(cliente.nome).split(' ')[0]}` : ''}</p>
          <p className="numero">{saldo}</p>
          <p>{saldo === 1 ? 'crédito disponível' : 'créditos disponíveis'} · 1 crédito = 1 Reel</p>
        </div>
        <div className="direita">
          <span className={`selo ${ativa ? 'ok' : 'alerta'}`}>{ASSINATURA[status] ?? 'Assinatura sem status'}</span>
          {renova && ativa && <p className="pequeno">Renova em {renova}</p>}
        </div>
      </section>

      {erro && <p className="erro" role="alert">{erro}</p>}

      <NovoReel
        podeCriar={ativa && saldo > 0}
        motivo={ativa ? 'Seus créditos deste mês acabaram.' : (SEM_CRIAR[status] ?? 'Sua assinatura precisa estar ativa para criar Reels.')}
        aoCriar={carregar}
      />

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

function ItemReel({ r, aoMudar }: { r: Reel; aoMudar: () => Promise<void> }) {
  const [ajustando, setAjustando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [semBaixar, setSemBaixar] = useState(false)
  const pronto = r.status === 'pronto' && r.video_url
  const emAjuste = Boolean(r.ajuste) && (r.status === 'na_fila' || r.status === 'produzindo')

  async function agir(acao: () => Promise<void>) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try {
      await acao()
      await aoMudar()
      setAjustando(false)
      setConfirmando(false)
      setTexto('')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function copiar() {
    if (await copiarTexto(r.legenda)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    } else setErro('Não consegui copiar. Selecione o texto da legenda e copie.')
  }

  async function baixar() {
    if (ocupado) return
    setOcupado(true)
    setSemBaixar(!(await baixarVideo(r.video_url!, r.tema)))
    setOcupado(false)
  }

  return (
    <li className="reel">
      <div className="cabeca">
        <div>
          <b>{r.tema}</b>
          <p className="pequeno">
            {[r.objetivo, r.tom, dataBR(r.criado)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={`selo ${r.status === 'erro' ? 'alerta' : r.aprovado ? 'ok' : 'espera'}`}>
          {r.aprovado ? 'Aprovado' : pronto ? 'Para revisar' : emAjuste ? 'Em ajuste' : (ROTULO[r.status] ?? r.status)}
        </span>
      </div>

      {r.status === 'erro' && (
        <p className="pequeno">Não conseguimos gerar este Reel. O crédito voltou para o seu saldo.</p>
      )}
      {(r.status === 'na_fila' || r.status === 'produzindo') && (
        <p className="pequeno">
          {emAjuste ? 'Estamos refazendo com o seu ajuste.' : 'Estamos produzindo.'} Esta tela atualiza sozinha quando
          ficar pronto.
        </p>
      )}

      {pronto && (
        <>
          {/* Antes de aprovar é só prévia: sem o atalho de baixar do navegador. */}
          <video
            className="previa"
            src={r.video_url!}
            controls
            playsInline
            preload="metadata"
            controlsList={r.aprovado ? undefined : 'nodownload'}
          />
          {r.erro && !r.aprovado && (
            <p className="pequeno">Não conseguimos aplicar o ajuste desta vez. O vídeo anterior continua aqui e você pode pedir o ajuste de novo.</p>
          )}
          {r.legenda && (
            <div className="legenda">
              <p>{r.legenda}</p>
              <button className="link" onClick={copiar}>
                {copiado ? 'Legenda copiada' : 'Copiar legenda'}
              </button>
            </div>
          )}
          {erro && <p className="erro" role="alert">{erro}</p>}
          {r.aprovado ? (
            <>
              <button className="botao" disabled={ocupado} onClick={baixar}>
                {ocupado ? 'Baixando…' : 'Baixar vídeo'}
              </button>
              {semBaixar && (
                <p className="pequeno">
                  Seu navegador não deixou baixar direto.{' '}
                  <a href={r.video_url!} target="_blank" rel="noreferrer">Abra o vídeo</a> e use a opção de salvar.
                </p>
              )}
            </>
          ) : ajustando ? (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                agir(() => pedirAjuste(r.id, texto.trim()))
              }}
            >
              <label htmlFor={`aj${r.id}`}>O que você quer ajustar?</label>
              <textarea
                id={`aj${r.id}`}
                required
                minLength={5}
                maxLength={500}
                rows={3}
                placeholder="Ex.: trocar a frase do começo por uma pergunta"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <p className="pequeno">Você só pode pedir 1 ajuste neste Reel. Escreva tudo o que quer mudar.</p>
              <div className="acoes">
                <button className="botao" disabled={ocupado || texto.trim().length < 5}>
                  {ocupado ? 'Enviando…' : 'Enviar ajuste'}
                </button>
                <button type="button" className="botao secundario" disabled={ocupado} onClick={() => setAjustando(false)}>
                  Voltar
                </button>
              </div>
            </form>
          ) : confirmando ? (
            <>
              <p className="pequeno">
                Aprovar libera o vídeo para baixar.{r.ajuste ? '' : ' Depois disso não dá mais para pedir ajuste.'}
              </p>
              <div className="acoes">
                <button className="botao" disabled={ocupado} onClick={() => agir(() => aprovarReel(r.id))}>
                  {ocupado ? 'Aprovando…' : 'Sim, aprovar'}
                </button>
                <button className="botao secundario" disabled={ocupado} onClick={() => setConfirmando(false)}>
                  Voltar
                </button>
              </div>
            </>
          ) : (
            <div className="acoes">
              <button className="botao" onClick={() => setConfirmando(true)}>Aprovar</button>
              {!r.ajuste && (
                <button className="botao secundario" onClick={() => setAjustando(true)}>Pedir ajuste</button>
              )}
            </div>
          )}
          {!r.aprovado && !confirmando && !ajustando && (
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

function NovoReel({ podeCriar, motivo, aoCriar }: { podeCriar: boolean; motivo: string; aoCriar: () => Promise<void> }) {
  const [tema, setTema] = useState('')
  const [tom, setTom] = useState(TONS[0])
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0])
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const curto = tema.trim().length < 5

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro('')
    setMsg('')
    if (curto) return setErro('Conte em poucas palavras sobre o que é o Reel.')
    setEnviando(true)
    try {
      await pedirReel(tema.trim(), tom, objetivo)
      setTema('')
      setMsg('Pedido recebido. Seu Reel entrou na fila e aparece aqui embaixo quando ficar pronto.')
      await aoCriar()
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
          maxLength={TEMA_MAX}
          rows={3}
          placeholder="Ex.: 3 sinais de que a ansiedade está pedindo atenção"
          value={tema}
          onChange={(e) => { setTema(e.target.value); setMsg('') }}
        />
        <p className="pequeno contador">{tema.length}/{TEMA_MAX}</p>
        <label htmlFor="objetivo">Objetivo do conteúdo</label>
        <select id="objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
          {OBJETIVOS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <label htmlFor="tom">Jeito de falar</label>
        <select id="tom" value={tom} onChange={(e) => setTom(e.target.value)}>
          {TONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <p className="pequeno">{VOZES[TONS.indexOf(tom)]?.frase}</p>
        <p className="pequeno">Formato: {FORMATO}, com o seu nome na tela.</p>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {msg && <p className="sucesso" role="status">{msg}</p>}
        <button className="botao" disabled={!podeCriar || enviando}>
          {enviando ? 'Enviando…' : 'Criar Reel (usa 1 crédito)'}
        </button>
        {!podeCriar && <p className="pequeno">{motivo}</p>}
      </form>
    </section>
  )
}

function Perfil({ cliente, aoSalvar }: { cliente: Linha; aoSalvar: () => Promise<void> }) {
  const [nome, setNome] = useState(txt(cliente.nome))
  const [profissao, setProfissao] = useState(txt(cliente.profissao))
  const [registro, setRegistro] = useState(txt(cliente.registro))
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const mudou =
    nome.trim() !== txt(cliente.nome) || profissao.trim() !== txt(cliente.profissao) || registro.trim() !== txt(cliente.registro)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (salvando) return
    setMsg('')
    setErro('')
    if (!nome.trim()) return setErro('Escreva o seu nome.')
    setSalvando(true)
    try {
      await salvarPerfil(cliente.id, { nome: nome.trim(), profissao: profissao.trim(), registro: registro.trim() })
      await aoSalvar()
      setMsg('Dados salvos. Valem para os próximos Reels.')
    } catch (er) {
      setErro(mensagemDeErro(er))
    } finally {
      setSalvando(false)
    }
  }

  const campo = (mudar: (v: string) => void) => (e: { target: { value: string } }) => {
    mudar(e.target.value)
    setMsg('')
  }

  return (
    <section className="cartao">
      <h2>Como seu nome aparece no Reel</h2>
      <form onSubmit={salvar}>
        <label htmlFor="nome">Nome</label>
        <input id="nome" required maxLength={80} autoComplete="name" value={nome} onChange={campo(setNome)} />
        <label htmlFor="profissao">Profissão</label>
        <input id="profissao" maxLength={60} placeholder="Ex.: Psicóloga" value={profissao} onChange={campo(setProfissao)} />
        <label htmlFor="registro">Registro (se tiver)</label>
        <input id="registro" maxLength={40} placeholder="Ex.: CRP 06/000000" value={registro} onChange={campo(setRegistro)} />
        {erro && <p className="erro" role="alert">{erro}</p>}
        {msg && <p className="sucesso" role="status">{msg}</p>}
        <button className="botao secundario" disabled={salvando || !mudou}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </section>
  )
}
