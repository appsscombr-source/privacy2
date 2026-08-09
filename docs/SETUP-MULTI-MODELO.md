# Setup Multi-Modelo (MODEL_ID)

Este guia explica como configurar o sistema para ter vídeos diferentes por modelo, usando deploys separados.

---

## 1. Atualizar o Supabase

No **SQL Editor** do seu projeto Supabase, rode:

```sql
ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS model_id TEXT;
CREATE INDEX IF NOT EXISTS idx_medias_model_id ON public.medias (model_id);
```

> Se você tem mídias antigas que quer vincular a um modelo, rode também:
> ```sql
> UPDATE public.medias SET model_id = 'modelo_a' WHERE model_id IS NULL;
> ```

---

## 2. Configurar variável de ambiente em cada deploy

### Cloudflare Workers (wrangler.jsonc)
Adicione no seu `wrangler.jsonc`:
```json
{
  "vars": {
    "MODEL_ID": "modelo_a"
  }
}
```
Ou pelo painel: **Workers & Pages → seu projeto → Settings → Variables → Add variable**
- Nome: `MODEL_ID`
- Valor: `modelo_a` (ou o nome que quiser, ex: `larissa`, `julia`)

### Netlify
Pelo painel: **Site → Site configuration → Environment variables → Add variable**
- Nome: `MODEL_ID`
- Valor: `modelo_b`

---

## 3. Como funciona

- Cada deploy tem seu próprio `MODEL_ID`
- Quando alguém acessa a área de membros, o sistema busca apenas os vídeos com `model_id` igual ao do deploy
- Ao cadastrar um vídeo pelo painel admin, ele é automaticamente vinculado ao `MODEL_ID` do deploy onde o admin está rodando

---

## 4. Adicionar novos modelos

Para cada novo modelo:
1. Faça um novo deploy (Cloudflare, Netlify, Vercel, etc.)
2. Configure `MODEL_ID` com um valor único (ex: `modelo_c`)
3. Acesse o painel admin do novo deploy e cadastre os vídeos normalmente

---

## Resumo dos MODEL_IDs

| Deploy        | MODEL_ID   |
|---------------|------------|
| Cloudflare    | `modelo_a` |
| Netlify       | `modelo_b` |
| (novo deploy) | `modelo_c` |

Os nomes são livres — use o que fizer sentido para você (nome da modelo, slug, etc.)
