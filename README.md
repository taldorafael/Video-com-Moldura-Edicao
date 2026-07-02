# Video com Moldura Edição

Aplique molduras em vídeos diretamente no navegador — sem upload, sem servidor e com total privacidade. Todo o processamento é realizado localmente através do [FFmpeg.wasm](https://ffmpeg.org/).

**Demo:** [videocommoldura.vercel.app](https://videocommoldura.vercel.app/)

## Como funciona

1. Você envia uma moldura com área central transparente ou não (preferencialmente em PNG com transparência).
2. O aplicativo detecta automaticamente quando a região é transparente onde o vídeo será exibido.
3. Você arrasta um ou vários vídeos (MP4, MOV ou WEBM).
4. O FFmpeg.wasm processa tudo diretamente no navegador — o vídeo é encaixado na área transparente da moldura, que permanece sobreposta ao conteúdo.
5. Ao final, você pode baixar cada vídeo individualmente ou todos os arquivos processados em um único `.zip`.

Nenhum arquivo é enviado para servidores externos. A moldura e os vídeos permanecem exclusivamente no dispositivo do usuário durante todo o processo.

## Stack

* HTML + CSS + JavaScript puro (sem framework ou etapa de build)
* [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) `0.11.6` — processamento de vídeo via WebAssembly
* [`JSZip`](https://stuk.github.io/jszip/) — geração de arquivos `.zip`
* Deploy estático na [Vercel](https://vercel.com/)

## Estrutura do projeto

```text
.
├── index.html       # Interface e estilos
├── script.js        # Upload, análise da moldura e processamento via FFmpeg
└── vercel.json      # Configurações de cache e headers necessários
```

## Rodando localmente

Como o aplicativo utiliza recursos modernos do navegador, recomenda-se servir os arquivos através de um servidor HTTP local:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Depois, acesse:

```text
http://localhost:8080
```

## Deploy na Vercel

O projeto é totalmente estático. Basta importar o repositório para a Vercel sem configurar comandos de build ou diretórios de saída personalizados.

O arquivo `vercel.json` já inclui:

* `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy` para melhor compatibilidade e desempenho do FFmpeg.wasm.
* Cache de longo prazo para arquivos JavaScript e WebAssembly.
* Cache desabilitado para `index.html`, garantindo que atualizações sejam exibidas imediatamente aos usuários.

## Requisitos do navegador

Compatível com versões recentes do:

* Google Chrome
* Microsoft Edge
* Mozilla Firefox

Navegadores sem suporte a WebAssembly ou muito antigos podem não conseguir executar o processamento.

## Limitações conhecidas

* Todo o processamento ocorre na CPU do dispositivo do usuário; vídeos longos ou lotes grandes podem exigir mais tempo para serem concluídos.
* A moldura deve possuir uma área realmente transparente (canal alpha) para que a detecção automática funcione corretamente.

## Licença

Uso livre para fins pessoais e comerciais. Você pode utilizar, copiar, modificar e distribuir o projeto conforme necessário.
