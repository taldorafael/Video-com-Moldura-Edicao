# Video com Moldura Edição

Aplique molduras PNG em vídeos direto no navegador — sem upload, sem servidor, 100% privado. Todo o processamento roda localmente via [FFmpeg.wasm](https://ffmpeg.org/).

**Demo:** [videocommoldura.vercel.app](https://videocommoldura.vercel.app/)

## Como funciona

1. Você envia uma moldura em **PNG com fundo transparente** no centro.
2. O app detecta automaticamente a área transparente (onde o vídeo vai aparecer).
3. Você arrasta um ou vários vídeos (MP4, MOV, WEBM).
4. O FFmpeg.wasm processa tudo **no seu navegador** — o vídeo é encaixado na área transparente e a moldura fica por cima.
5. Baixe cada vídeo individualmente ou todos juntos em `.zip`.

Nenhum arquivo é enviado para nenhum servidor — moldura e vídeos nunca saem do dispositivo do usuário.

## Stack

- HTML + CSS + JavaScript puro (sem build step, sem framework)
- [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) `0.11.6` — processamento de vídeo via WebAssembly
- [`JSZip`](https://stuk.github.io/jszip/) — geração do `.zip` com múltiplos resultados
- Deploy estático na [Vercel](https://vercel.com/)

## Estrutura do projeto

```
.
├── index.html      # interface e estilos
├── script.js       # lógica de upload, análise da moldura e processamento FFmpeg
└── vercel.json      # headers de deploy (COOP/COEP necessários para FFmpeg.wasm, cache)
```

## Rodando localmente

Como o app usa `SharedArrayBuffer`/isolamento de origem cruzada de forma opcional, o ideal é servir os arquivos por HTTP (não abrir o `index.html` direto do disco):

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Deploy na Vercel

O projeto é 100% estático — basta importar o repositório na Vercel, sem build command nem output directory customizados. O `vercel.json` já configura:

- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` — habilitam isolamento de origem cruzada para melhor performance do FFmpeg.wasm.
- `Cache-Control` de longo prazo para `script.js` e arquivos `.wasm`.
- `Cache-Control: no-cache` para `index.html`, garantindo que atualizações apareçam imediatamente para os usuários.

## Requisitos do navegador

Funciona nas versões recentes de Chrome, Edge e Firefox. Navegadores muito antigos ou sem suporte a WebAssembly não conseguem carregar o FFmpeg.

## Limitações conhecidas

- O processamento acontece na CPU do usuário via WebAssembly — vídeos longos ou em lote grande podem demorar, dependendo do dispositivo.
- A moldura precisa ter uma área verdadeiramente transparente (alpha) no centro para a detecção automática funcionar bem.

## Licença

Defina aqui a licença do projeto (ex.: MIT) conforme sua preferência.
