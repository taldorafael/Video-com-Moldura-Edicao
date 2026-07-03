# Video com Moldura Edição

Aplique molduras em vídeos direto no navegador — sem upload, sem servidor, sem enviar nada para fora do seu computador. Todo o processamento roda localmente com [FFmpeg.wasm](https://ffmpeg.org/).

**Demo:** [videocommoldura.vercel.app](https://videocommoldura.vercel.app/)

## O que o app faz

O projeto tem duas partes, organizadas em abas:

**1. Aplicar Moldura em Vídeo**
Você envia uma arte PNG com uma área transparente, arrasta um ou vários vídeos (MP4, MOV, WEBM) e o app encaixa cada vídeo dentro da área transparente, mantendo a moldura por cima. No final, dá pra baixar cada vídeo separado ou todos juntos em um `.zip`.

**2. Editor de Molduras**
Um editor visual (estilo Canva) para criar a moldura do zero: textos, formas, imagens, logos, guias de alinhamento e templates prontos. Dá pra desenhar a área onde o vídeo vai entrar, exportar como PNG transparente e enviar direto para a aba de aplicação, sem precisar sair do site.

Nenhum arquivo — moldura ou vídeo — sai do dispositivo do usuário em nenhum momento.

## Stack

- HTML + CSS + JavaScript puro, sem build step
- [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) `0.11.6` para o processamento de vídeo via WebAssembly
- [`Fabric.js`](http://fabricjs.com/) para o editor visual de molduras
- [`JSZip`](https://stuk.github.io/jszip/) para gerar o `.zip` com os vídeos prontos
- Deploy estático na [Vercel](https://vercel.com/)

Fabric.js e JSZip só são carregados quando realmente são usados (ao abrir o editor ou ao baixar múltiplos vídeos), então o carregamento inicial da página fica leve.

## Estrutura do projeto

```text
.
├── index.html      # App inteiro: interface, estilos e lógica
└── vercel.json      # Headers de cache e isolamento de origem (necessários para o FFmpeg.wasm)
```

## Rodando localmente

O app depende de recursos modernos do navegador (SharedArrayBuffer, WebAssembly), então precisa ser servido por HTTP — abrir o arquivo direto (`file://`) não funciona.

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Deploy na Vercel

Projeto totalmente estático. Basta importar o repositório — não é preciso configurar comando de build nem diretório de saída.

O `vercel.json` já cuida de:

- `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy`, exigidos para o FFmpeg.wasm rodar em modo multi-thread (mais rápido).
- Cache desabilitado em `index.html`, para que atualizações apareçam na hora para quem já visitou o site.

Se o navegador não expuser `SharedArrayBuffer` (por falta desses headers, por exemplo), o app ainda funciona — só processa em modo single-thread, mais lento.

## Navegadores suportados

Versões recentes de Chrome, Edge e Firefox. Navegadores sem suporte a WebAssembly podem não conseguir processar os vídeos.

## Limitações conhecidas

- O processamento roda inteiramente na CPU do usuário — vídeos longos ou lotes grandes demoram mais.
- A moldura precisa ter uma área realmente transparente (canal alpha) para a detecção automática funcionar.

## Licença

Uso livre para fins pessoais e comerciais.
