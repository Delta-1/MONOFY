# Monofy

O Monofy funciona como um módulo isolado dentro do único projeto Supabase **WORKSPACE** (`qaiqflcxfxygynumapyp`). Ele está configurado em **modo pessoal**: não há cadastro, login social, planos ou cobrança por créditos. As tabelas e funções usam os prefixos `monofy_` e `monofy-`, sem misturar dados com os outros módulos do WORKSPACE.

## Acesso pessoal

- Usuário: `admin`
- Senha: `12345678`
- A sessão fica ativa apenas na aba/janela atual (`sessionStorage`)
- O conteúdo, as preferências, o perfil e a chave do Gemini ficam no armazenamento local do navegador

Esse acesso é uma trava de conveniência para uso pessoal. Como o frontend é estático, as credenciais fazem parte do código publicado e não substituem autenticação segura no servidor.

## Estrutura no Supabase

- Migração: `supabase/migrations/20260903120000_monofy_workspace_module.sql`
- Tabelas: `monofy_profiles`, `monofy_credit_transactions`, `monofy_subscriptions`, `monofy_public_templates`, `monofy_university_logos` e `monofy_pipu_memory`
- Edge Functions: todas em `supabase/functions/monofy-*`
- Autorização: RLS continua ativa em todas as tabelas
- Contas: o espelho de perfis do Monofy está vazio e o gatilho que copiava usuários do WORKSPACE foi removido
- Compatibilidade: tabelas antigas de créditos e assinaturas continuam vazias e inativas; novos pagamentos e assinaturas retornam `410 Gone`

## Chave do Gemini

A chave é adicionada em **Ajustes → Chave da API do Gemini**. A tela permite salvar, testar, mostrar/ocultar e excluir a chave. Ela não é salva no banco: permanece no `localStorage` do dispositivo e é enviada somente no corpo da chamada às Edge Functions `monofy-ai-generate` e `monofy-ai-image`.

Os modelos continuam configuráveis por `GEMINI_TEXT_MODEL` e `GEMINI_IMAGE_MODEL` nos segredos do WORKSPACE. As duas funções de IA aceitam chamadas sem JWT porque o modo pessoal não cria uma sessão Supabase; a chave fornecida pelo próprio usuário é obrigatória.

## Publicação

O frontend é estático e pode continuar no GitHub Pages. A URL e a chave publicável do WORKSPACE ficam no `index.html`; nenhuma chave `service_role` é exposta no navegador. Para voltar ao produto multiusuário no futuro, reative os controles de Auth/créditos e publique novamente as versões autenticadas das Edge Functions.
