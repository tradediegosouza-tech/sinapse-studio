# Sinapse Studio

Área onde a assinante entra (link no e-mail, sem senha), vê os créditos, pede Reels e baixa os vídeos prontos.
React (Vite) + Supabase. Publicado de graça no GitHub Pages.

## Telas
- **Entrar**: e-mail → link de acesso. Só entra quem já é cliente (o cadastro nasce no pagamento).
- **Painel**: saldo de créditos, status da assinatura e data de renovação.
- **Criar Reel**: tema + tom → `pedir_reel` (gasta 1 crédito).
- **Meus Reels**: fila / produzindo / pronto (com vídeo e botão baixar) / erro. Atualiza sozinho a cada 20 s.
- **Seus dados no vídeo**: nome, profissão e registro (aparecem nos Reels).

## Rodar no computador
```bash
cp .env.example .env.local   # e cole a chave anon
npm install
npm run dev
```

## Publicar
1. Settings › Secrets and variables › Actions › **Variables** › `VITE_SUPABASE_ANON_KEY` = chave anon.
2. Settings › Pages › Source = **GitHub Actions**.
3. Supabase › Authentication › URL Configuration: Site URL e Redirect URL =
   `https://tradediegosouza-tech.github.io/sinapse-studio/`.

Cada push na `main` publica sozinho.

## Segurança
- No navegador só vai a chave **anon**. Quem protege os dados é o RLS (ver `docs/ESQUEMA.md`).
- A chave **service_role** fica só no n8n da VPS. Nunca neste repositório.

## Falta (ordem)
1. Ponte Cakto → Supabase no n8n (cria cliente + créditos; cancela/pausa).
2. Ponte fila → fábrica custo zero → `video_url`.
3. Medir custo e capacidade por vídeo.
4. Teste dos 8 passos como cliente real, antes de vender.
