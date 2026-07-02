# VeoAIFree — Interface Web Local

Gerador de vídeo com IA usando o provedor `veoaifree-web` documentado no
OmniRoute FREE_TIERS.md (categoria: `video`, tipo: `keyless-unlimited`).

## Pré-requisitos

- Node.js ≥ 18
- Conexão com a internet

## Instalação e uso

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o servidor proxy
npm start

# 3. Abrir no navegador
# http://localhost:3000
```

## Estrutura

```
veoaifree/
├── server.js          ← Proxy backend Node.js (porta 3000)
├── package.json
└── public/
    └── index.html     ← Interface web completa (HTML único)
```

## Por que é necessário um backend?

O site VeoAIFree usa WordPress com AJAX autenticado por nonce (token
temporário gerado server-side). Chamadas diretas do browser para
`veoaifree.com/wp-admin/admin-ajax.php` são bloqueadas por CORS.

O `server.js` resolve isso:
1. Busca o nonce dinamicamente na página HTML do VeoAIFree
2. Encaminha as requisições com os headers corretos de browser
3. Retorna o resultado para o frontend

## Endpoints do VeoAIFree (confirmados via engenharia reversa)

| Ação                    | actionType              | Fonte |
|-------------------------|-------------------------|-------|
| Iniciar geração         | `img-to-video-start`    | logic.js #generate_it_img_video |
| Verificar resultado     | `final-video-results`   | logic.js getVideoData() |
| Melhorar prompt         | `main-prompt-generation`| logic.js .megic-prompt click |

## O que foi confirmado vs. deduzido

### ✅ Confirmado pela documentação / código-fonte

- URL do AJAX: `https://veoaifree.com/wp-admin/admin-ajax.php`
- Parâmetro `action`: `veo_video_generator`
- Parâmetro `nonce`: obtido de `ajax_object.nonce` na página HTML
- `actionType`: `img-to-video-start`, `final-video-results`, `main-prompt-generation`
- Campo de imagem: `img1` via FormData
- Parâmetros: `prompt`, `totalVariations`, `aspectRatio`, `video_quality`
- Modelos: `3.1` (VEO 3.1) e `2.0` (VEO 2.0)
- Formatos: `VIDEO_ASPECT_RATIO_PORTRAIT` e `VIDEO_ASPECT_RATIO_LANDSCAPE`
- Tempo de espera antes do 1º poll: ~85s (text-to-video), ~40s (img-to-video)
- Intervalo de polling: 20s
- Transformação da URL: `videos/` → `video/`
- Status de erro detectados: `Error`, `failed`, `retry`, `Limit`, `In Progress`
- FREE_TIERS.md (OmniRoute): provider `veoaifree-web`, status `keyless-unlimited`

### 🔍 Deduzido / inferido

- O nonce precisa ser extraído via scraping da página (padrão WordPress)
- O TTL do nonce foi estimado em 9 minutos (padrão WordPress é 10–12 min)
- A geração text-to-video usa o mesmo `actionType` `img-to-video-start` que
  o img-to-video — o handler do servidor aceita ambos (com ou sem img1)
- A contagem de variações foi fixada em 1 para simplificar o polling
  (o site original suporta até 4, mas retorna a mesma URL para todas)

## Notas de conformidade (FREE_TIERS.md)

O arquivo FREE_TIERS.md do OmniRoute classifica `veoaifree-web` como:
- **ToS**: `caution` — proíbe bots/scripts em "velocidade inumana"
- **Status**: `keyless-unlimited` — sem login, sem limites documentados
- **Categoria**: `video`

Use este projeto para fins pessoais e educacionais.
