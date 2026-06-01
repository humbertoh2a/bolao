# Bolao da Copa 2026

MVP de bolao da Copa usando Next.js, Supabase e Tailwind.

## Como rodar

1. Instale dependencias:

```bash
npm install
```

2. Crie um projeto no Supabase e rode o SQL em `supabase/schema.sql`.

3. Se voce ja tinha rodado o banco antes, rode tambem as migrations incrementais:

```text
supabase/add-participant-pins.sql
supabase/2026-rules-and-copa-json.sql
supabase/group-positions-and-new-knockout-points.sql
```

4. Copie `.env.local.example` para `.env.local` e preencha:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
```

5. Inicie o app:

```bash
npm run dev
```

## Fluxos

- `/`: usuario informa nome + PIN, salva placares da fase de grupos, aposta selecoes por fase no mata-mata e ve ranking.
- `/admin`: admin informa a senha de `ADMIN_PASSWORD`, cadastra participantes/PINs, atualiza resultados e marca classificados reais do mata-mata.

## Pontuacao

- Fase de grupos:
  - 5 pontos para placar exato.
  - 3 pontos para acertar vencedor/empate e tambem saldo ou gols do vencedor.
  - 2 pontos para acertar somente vencedor ou empate.
  - 5 pontos por acertar o 1º colocado de cada grupo.
  - 5 pontos por acertar o 2º colocado de cada grupo.
  - 2 pontos se acertar uma selecao classificada no top 2, mas em posicao invertida.
- Mata-mata:
  - 16 avos: sem pontuacao propria; a classificacao para essa fase sera pontuada nos grupos.
  - Oitavas: 6 pontos por selecao.
  - Quartas: 10 pontos por selecao.
  - Semifinais: 15 pontos por selecao.
  - Finalistas: 20 pontos por selecao.
  - Campeao: 35 pontos.

Todas as apostas fecham automaticamente em `2026-06-11T19:00:00Z`, abertura da Copa.
