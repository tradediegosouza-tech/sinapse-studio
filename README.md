# Sinapse Studio

App onde a profissional entra e cria os próprios Reels (React + Vite + Supabase).

- **Login:** link no e-mail (Supabase Auth), sem senha.
- **Painel:** saldo de créditos, criar Reel (tema + tom), lista dos Reels com ver/baixar, dados do nome/profissão/registro.
- **Banco:** projeto Supabase `zjsqtzqrwdktdcsinbcs` (tabelas `clientes`, `creditos`, `reels`, RLS, funções `saldo_creditos()` e `pedir_reel(tema, tom)`).

## Rodar

```bash
cp .env.example .env.local   # preencher a chave pública (anon/publishable)
npm install
npm run dev
```

Nunca colocar a chave `service_role` neste repositório.
