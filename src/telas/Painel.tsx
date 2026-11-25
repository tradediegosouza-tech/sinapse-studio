import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EMAIL_SUPORTE, LINK_COMPRAR_CREDITOS, PRODUCAO_ATIVA } from '../lib/config'
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
// Ideias prontas de tema (toque e edite). Só informam e acolhem: nada de promessa de resultado.
const SUGESTOES = [
  '3 sinais de que a ansiedade está pedindo atenção',
  'Terapia não é só para quem está em crise',
  'O que esperar da primeira sessão',
  'Como saber a hora de procurar ajuda',
]
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
  // Duas abas (como nos apps de vídeo): criar fica separado dos Reels pedidos.
  const [aba, setAba] = useState<'criar' | 'reels'>('criar')
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

  const paraRevisar = reels.filter((r) => r.status === 'pronto' && r.video_url && !r.aprovado).length

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
  // 1º acesso: sem nome e profissão o Reel sairia sem a identidade da profissional.
  // Psicóloga: o CFP exige nome + CRP na divulgação, então o registro vira obrigatório.
  const perfilPronto = Boolean(
    txt(cliente.nome).trim() && txt(cliente.profissao).trim() && (!pedeRegistro(txt(cliente.profissao)) || txt(cliente.registro).trim()),
  )

  return (
    <>
      <section className="cartao saldo">
        <div>
          <p className="rotulo">Olá{txt(cliente.nome) ? `, ${txt(cliente.nome).split(' ')[0]}` : ''}</p>
          <p className="numero">{saldo}</p>
          <p>{saldo === 1 ? 'crédito disponível' : 'créditos disponíveis'} · 1 crédito = 1 Reel</p>
          {perfilPronto && (
            <p className="pequeno assinatura">
              No vídeo: <b>{[txt(cliente.nome), txt(cliente.profissao), txt(cliente.registro)].filter((x) => x.trim()).join(' · ')}</b>{' '}
              <a href="#perfil" onClick={() => setAba('criar')}>Alterar</a>
            </p>
          )}
        </div>
        <div className="direita">
          <span className={`selo ${ativa ? 'ok' : 'alerta'}`}>{ASSINATURA[status] ?? 'Assinatura sem status'}</span>
          {renova && ativa && <p className="pequeno">Renova em {renova}</p>}
        </div>
      </section>

      {erro && <p className="erro" role="alert">{erro}</p>}

      {!PRODUCAO_ATIVA && (
        <section className="cartao aviso-ativacao" role="status">
          <h2>Produção em ativação</h2>
          <p>
            Estamos ligando a produção dos Reels. Enquanto isso, o botão de criar fica desligado e
            <b> nenhum crédito é descontado</b>. Seus créditos continuam guardados.
          </p>
          <p className="pequeno">Avisamos por e-mail assim que a produção estiver liberada.</p>
        </section>
      )}

      {aba === 'criar' && !perfilPronto && <Perfil cliente={cliente} aoSalvar={carregar} primeiroAcesso />}

      {aba === 'criar' && <NovoReel
        sugestoes={/psic|terap/i.test(txt(cliente.profissao)) ? SUGESTOES : []}
        podeCriar={PRODUCAO_ATIVA && ativa && saldo > 0 && perfilPronto}
        motivo={!perfilPronto ? (pedeRegistro(txt(cliente.profissao)) && txt(cliente.nome).trim() ? 'Preencha acima o seu CRP. O conselho pede nome e registro em todo conteúdo, e ele aparece no vídeo.' : 'Antes do 1º Reel, preencha acima seu nome e sua profissão. Eles aparecem no vídeo.') : !PRODUCAO_ATIVA ? 'Criação de Reels desligada durante a ativação. Nenhum crédito é descontado.' : ativa ? 'Seus créditos deste mês acabaram.' : (SEM_CRIAR[status] ?? 'Sua assinatura precisa estar ativa para criar Reels.')}
        aoCriar={async () => { await carregar(); setAba('reels'); window.scrollTo({ top: 0 }) }}
      />}

      {aba === 'reels' && <section className="cartao">
        <h2>Seus Reels</h2>
        {reels.length === 0 ? (
          <>
            <p className="aviso"><b>Pronta para o seu 1º Reel?</b> Aqui só aparecem os Reels que você pedir.</p>
            <button className="botao" onClick={() => setAba('criar')}>Criar meu 1º Reel</button>
          </>
        ) : (
          <ul className="lista">
            {reels.map((r) => (
              <ItemReel key={r.id} r={r} aoMudar={carregar} />
            ))}
          </ul>
        )}
      </section>}

      {aba === 'criar' && perfilPronto && <Perfil cliente={cliente} aoSalvar={carregar} />}

      <section className="cartao">
        <h2>Precisa de ajuda?</h2>
        <p>
          Fale com a gente pelo e-mail{' '}
          <a href={`mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent('Ajuda com o Sinapse Studio')}`}>{EMAIL_SUPORTE}</a>.
        </p>
        <h2 className="mt">Mais créditos</h2>
        {LINK_COMPRAR_CREDITOS ? (
          <a className="botao secundario" href={LINK_COMPRAR_CREDITOS} target="_blank" rel="noreferrer">
            Comprar +10 créditos
          </a>
        ) : (
          <p className="pequeno">A compra de créditos extras está em ativação. Se precisar antes, fale com o suporte.</p>
        )}
      </section>
      <nav className="abas" aria-label="Seções">
        <button className={aba === 'criar' ? 'aba ativa' : 'aba'} onClick={() => { setAba('criar'); window.scrollTo({ top: 0 }) }}>
          Criar
        </button>
        <button className={aba === 'reels' ? 'aba ativa' : 'aba'} onClick={() => { setAba('reels'); window.scrollTo({ top: 0 }) }}>
          Meus Reels{paraRevisar > 0 && <span className="bolinha">{paraRevisar}</span>}
        </button>
      </nav>
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

      {r.status !== 'erro' && (
        <ol className="passos" aria-label="Andamento">
          {['Pedido', 'Produção', 'Revisão', 'Pronto'].map((nome, i) => {
            const etapa = r.aprovado ? 3 : pronto ? 2 : r.status === 'produzindo' ? 1 : 0
            return <li key={nome} className={i < etapa || (i === 3 && etapa === 3) ? 'feito' : i === etapa ? 'atual' : ''}>{nome}</li>
          })}
        </ol>
      )}
      {r.status === 'erro' && (
        <p className="pequeno">Não conseguimos gerar este Reel. O crédito voltou para o seu saldo.</p>
      )}
      {(r.status === 'na_fila' || r.status === 'produzindo') && (
        <p className="pequeno">
          {!PRODUCAO_ATIVA
            ? 'Produção em ativação: seu pedido está guardado e entra na fila assim que a produção for ligada.'
            : emAjuste
              ? 'Estamos refazendo com o seu ajuste. Esta tela atualiza sozinha quando ficar pronto.'
              : r.status === 'na_fila'
                ? 'Seu pedido está na fila: a produção começa em até 1 hora. Esta tela atualiza sozinha quando ficar pronto.'
                : 'Estamos produzindo o seu Reel. Esta tela atualiza sozinha quando ficar pronto.'}
        </p>
      )}

      {pronto && (
        <>
          {/* Antes de aprovar é só prévia: sem o atalho de baixar do navegador. */}
          <video
            className="previa"
            src={`${r.video_url!}#t=1.5`}
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
              {!r.ajuste && PRODUCAO_ATIVA && (
                <button className="botao secundario" onClick={() => setAjustando(true)}>Pedir ajuste</button>
              )}
            </div>
          )}
          {!r.aprovado && !confirmando && !ajustando && (
            <p className="pequeno">
              {r.ajuste ? 'Este Reel já teve o ajuste incluído. ' : 'Você tem 1 ajuste por Reel. '}
              Assista e leia a legenda com calma antes de aprovar: quem publica é você.
            </p>
          )}
        </>
      )}
    </li>
  )
}

function NovoReel({ podeCriar, motivo, aoCriar, sugestoes }: { podeCriar: boolean; motivo: string; aoCriar: () => Promise<void>; sugestoes: string[] }) {
  const [tema, setTema] = useState('')
  const [tom, setTom] = useState(TONS[0])
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0])
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const curto = tema.trim().length < 5

  // 1º toque só mostra o resumo; o crédito só é usado no "Confirmar e produzir" (evita tema digitado errado).
  async function criar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro('')
    setMsg('')
    if (curto) return setErro('Conte em poucas palavras sobre o que é o Reel.')
    if (!confirmar) return setConfirmar(true)
    setEnviando(true)
    try {
      await pedirReel(tema.trim(), tom, objetivo)
      setTema('')
      setConfirmar(false)
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
          onChange={(e) => { setTema(e.target.value); setMsg(''); setConfirmar(false) }}
        />
        <p className="pequeno contador">{tema.length}/{TEMA_MAX}</p>
        {sugestoes.length > 0 && !tema.trim() && (
          <>
            <p className="pequeno">Sem ideia? Toque em uma e mude como quiser:</p>
            <div className="chips">
              {sugestoes.map((sg) => (
                <button type="button" key={sg} className="chip ideia" onClick={() => { setTema(sg); setMsg(''); setConfirmar(false) }}>
                  {sg}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="rotulo-campo" id="rot-objetivo">Objetivo do conteúdo</p>
        <div className="chips" role="radiogroup" aria-labelledby="rot-objetivo">
          {OBJETIVOS.map((o) => (
            <button type="button" key={o} role="radio" aria-checked={objetivo === o} className={objetivo === o ? 'chip ativo' : 'chip'} onClick={() => { setObjetivo(o); setConfirmar(false) }}>
              {o}
            </button>
          ))}
        </div>
        <p className="rotulo-campo" id="rot-tom">Jeito de falar</p>
        <div className="chips" role="radiogroup" aria-labelledby="rot-tom">
          {VOZES.map((v, i) => (
            <button type="button" key={v.nome} role="radio" aria-checked={tom === TONS[i]} className={tom === TONS[i] ? 'chip ativo' : 'chip'} onClick={() => { setTom(TONS[i]); setConfirmar(false) }}>
              {v.nome}
            </button>
          ))}
        </div>
        <p className="pequeno">{VOZES[TONS.indexOf(tom)]?.frase}</p>
        <p className="pequeno">Formato: {FORMATO}, com o seu nome na tela.</p>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {msg && <p className="sucesso" role="status">{msg}</p>}
        {confirmar && podeCriar ? (
          <div className="confirmar" role="status">
            <b>Confira antes de usar 1 crédito</b>
            <p><span className="pequeno">Tema:</span> {tema.trim()}</p>
            <p className="pequeno">{objetivo} · {tom}</p>
            <p className="pequeno">Veja se o tema está escrito do jeito certo.</p>
            <div className="acoes">
              <button className="botao" disabled={enviando}>{enviando ? 'Enviando…' : 'Confirmar e produzir'}</button>
              <button type="button" className="botao secundario" disabled={enviando} onClick={() => { setConfirmar(false); document.getElementById('tema')?.focus() }}>
                Editar tema
              </button>
            </div>
          </div>
        ) : (
          <button className="botao" disabled={!podeCriar || enviando}>Criar Reel (usa 1 crédito)</button>
        )}
        {!podeCriar && <p className="pequeno">{motivo}</p>}
      </form>
    </section>
  )
}

// Só psicóloga formada precisa de CRP (regra do CFP). Terapeuta, coach, estudante etc. ficam livres.
function pedeRegistro(profissao: string) {
  return /psic[oó]log/i.test(profissao) && !/estudante|acad[eê]mic|graduand|est[aá]gi/i.test(profissao)
}

function Perfil({ cliente, aoSalvar, primeiroAcesso = false }: { cliente: Linha; aoSalvar: () => Promise<void>; primeiroAcesso?: boolean }) {
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
    if (primeiroAcesso && !profissao.trim()) return setErro('Escreva a sua profissão.')
    if (pedeRegistro(profissao) && !registro.trim()) return setErro('Escreva o seu CRP. Ele aparece no vídeo, como o conselho pede.')
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
    <section id="perfil" className={primeiroAcesso ? 'cartao destaque' : 'cartao'}>
      <h2>{primeiroAcesso ? 'Bem-vinda! Primeiro, como seu nome aparece no Reel' : 'Como seu nome aparece no Reel'}</h2>
      {primeiroAcesso && <p>Leva 30 segundos. Depois disso, o botão de criar o seu 1º Reel é liberado.</p>}
      <form onSubmit={salvar}>
        <label htmlFor="nome">Nome</label>
        <input id="nome" required maxLength={80} autoComplete="name" value={nome} onChange={campo(setNome)} />
        <label htmlFor="profissao">Profissão</label>
        <input id="profissao" required={primeiroAcesso} maxLength={60} placeholder="Ex.: Psicóloga" value={profissao} onChange={campo(setProfissao)} />
        <label htmlFor="registro">{pedeRegistro(profissao) ? 'Registro (CRP)' : 'Registro (se tiver)'}</label>
        <input id="registro" required={pedeRegistro(profissao)} maxLength={40} placeholder="Ex.: CRP 06/000000" value={registro} onChange={campo(setRegistro)} />
        {erro && <p className="erro" role="alert">{erro}</p>}
        {msg && <p className="sucesso" role="status">{msg}</p>}
        <button className={primeiroAcesso ? 'botao' : 'botao secundario'} disabled={salvando || !mudou}>
          {salvando ? 'Salvando…' : primeiroAcesso ? 'Salvar e liberar meu 1º Reel' : 'Salvar'}
        </button>
      </form>
    </section>
  )
}
