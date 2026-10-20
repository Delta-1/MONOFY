# Monofy · Academic Studio

Editor acadêmico estático, com edição manual completa e IA opcional. A área de trabalhos não exige conta, Supabase, servidor de aplicação nem banco remoto. Pode ser hospedada no GitHub Pages.

## Criar e editar

1. Abra **Criar um trabalho** e escolha investigação, monografia, relatório, mapa mental, mapa conceitual ou documento livre.
2. Escolha idioma (português, espanhol ou inglês), título e modelo inicial de formatação.
3. Edite diretamente na folha. Cole texto formatado do Word/Google Docs; use títulos, listas, tabelas, imagens e alinhamento.
4. Personalize a capa com textos e logo. Arraste os blocos ou use os botões ↑/↓, disponíveis também por teclado e toque.
5. Ajuste fonte, tamanho, entrelinhas, margens, recuo e papel A4/Carta no painel **Formato**.

No celular, o modo **Escrever / página** alterna escrita com texto legível e a visualização da folha. O zoom da folha aceita botões, gesto com dois dedos e Ctrl/⌘ + rolagem; animações respeitam a preferência por movimento reduzido.

Os modelos ABNT/APA são pontos de partida ajustáveis. Confira as regras específicas da instituição. A prévia organiza o texto por seções; a paginação física final é calculada na impressão e pelo Word, não por estimativas de palavras.

## Biblioteca e citações rastreáveis

- Adicione PDFs, DOCX, TXT/MD e imagens, até 30 MB por arquivo.
- PDF: arquivo original e texto extraído por página ficam salvos juntos no navegador. Pesquise, abra a página, amplie e selecione um trecho para citar.
- Uma citação só recebe vínculo quando o trecho é localizado literalmente na página indicada (espaços e caixa são normalizados). Isso não valida automaticamente a interpretação ou a qualidade científica da fonte.
- Passe sobre uma citação para ver trecho e miniatura da página; clique ou toque para abrir o leitor. A referência usa os dados bibliográficos fornecidos pelo usuário, sem inventar autoria ou datas.
- As páginas indicadas são as do **arquivo digital**, que podem diferir da numeração impressa.
- DOCX é importado como texto contínuo; a paginação original do Word não é conhecida. PDF escaneado pode ser visualizado, mas precisa de OCR externo para ter texto pesquisável e citações verificáveis.
- Use uma página ou recorte de ilustração como figura e acrescente legenda. A fonte e a página acompanham a imagem. Também é possível colar ou enviar imagens próprias.

## IA opcional, sem Supabase

Configure sua chave e o modelo Gemini em **Ajustes**. A chave fica apenas na memória da aba por padrão; salvá-la no navegador é uma opção explícita. Ela nunca entra no backup do trabalho.

O assistente confirma o idioma **na conversa** antes de gerar. Pode redigir uma seção, todas as seções em sequência ou um mapa. A geração usa uma seleção de até oito páginas dos materiais, ranqueadas por termos do tema/seção, com até 10 mil caracteres por página. O leitor mostra a fonte selecionada durante a geração; o histórico registra as páginas consultadas.

Os trechos são enviados diretamente à API Gemini quando o usuário solicita a IA. O aplicativo não simula visão computacional: usa o texto extraído e um leitor visual da página. PDFs sem texto não são usados como evidência textual. Respostas da IA são tratadas como dados; citações precisam passar pela conferência literal. Referências rejeitadas não viram vínculos e parágrafos sem evidência são marcados **[Revisar fonte]**. O rascunho é acrescentado ao texto existente, sem substituí-lo. Revise o resultado acadêmico antes de entregar.

A IA depende de conexão, chave válida, modelo disponível e cotas do provedor. O restante do editor funciona sem IA.

## Exportação e preservação

- **Word (.docx)** nativo: fontes, margens, títulos, formatação de texto, listas nativas, tabelas, imagens incorporadas e referências. Citações verificadas recebem notas de rodapé com trecho, obra e página. Mapas são exportados como imagem com os conceitos editáveis preservados no backup.
- **Sumário automático do Word**: opcional. Atualize os campos/sumário no Word após abrir; números de página não são inventados.
- **PDF**: usa a impressão do navegador com papel e margens do trabalho. Confira a prévia, use escala 100% e desative cabeçalhos/rodapés do navegador.
- **Backup `.monofy.json`**: preserva o projeto editável, mapas, fontes originais e citações. Restaurar cria uma cópia.

A importação de Word preserva conteúdo semântico, títulos, tabelas e imagens; não é uma reprodução integral de recursos avançados como caixas de texto, controle de alterações ou cabeçalhos personalizados. Fontes instaladas, tabelas extensas, títulos longos e aplicativos diferentes podem mudar as quebras de página da exportação. A capa reorganizada é convertida em blocos de fluxo no Word, não em objetos flutuantes livres.

Trabalhos e arquivos ficam em **IndexedDB neste navegador/dispositivo**. Não há sincronização automática entre aparelhos. Limpar os dados do site pode removê-los: baixe backups. Falhas de armazenamento são mostradas; o editor não anuncia salvamento antes de a transação terminar. O histórico antigo em `monografia_history` é copiado uma única vez para o novo formato, sem apagar o original.

## Arquitetura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Entrada leve, sem scripts de banco ou frameworks remotos |
| `academic-core.js` | Modelo de documento, modelos iniciais e verificação literal de citações |
| `academic.js` | Editor, IndexedDB, biblioteca, assistente e importação/backup |
| `academic-export.js` | Exportador DOCX nativo e renderização de mapas |
| `academic.css` | Interface responsiva e regras de impressão |
| `vendor/` | Dependências de documento/PDF fixadas, com licenças e recursos de fonte |
| `legacy-studio.html` | Estúdio anterior, mantido para slides; IA de texto usa conexão direta ao Gemini |
| `supabase/` | Arquivos históricos inativos; não são necessários para executar o editor |

A interface e as bibliotecas principais da área acadêmica são locais. Fontes padrão, mapas de caracteres e módulos WASM opcionais do PDF.js são obtidos do CDN jsDelivr na versão fixada quando o PDF precisa deles; os documentos não são enviados ao CDN. O estúdio antigo de slides ainda possui dependências de CDN e não foi redesenhado nesta etapa. As migrações e funções Supabase foram mantidas no histórico de código; nenhum banco remoto foi alterado.

## Executar e testar

Sirva a raiz com um servidor HTTP estático, por exemplo:

```sh
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Use HTTPS ou localhost para instalação PWA. O service worker guarda os arquivos essenciais e recursos acessados; a primeira abertura requer o site disponível. Não há etapa de build em produção.

Para os testes de desenvolvimento, use Node.js 22 ou superior:

```sh
npm ci --ignore-scripts
npm run check
npm test
```

Os testes verificam o DOCX descompactado (margens, fontes, tabelas, numeração, sumário e notas), conferência das citações, sanitização de HTML, validação de backups, isolamento entre projetos e o fluxo de idioma/IA com provedor simulado. Não utilizam uma chave real nem fazem chamadas pagas.
