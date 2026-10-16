# GitHub Repository Mirror Backup (GRMB)

Sistema automatizado de alta resiliência e recuperação de desastres (*Disaster Recovery*) desenvolvido em TypeScript e Node.js para espelhar e sincronizar incrementalmente repositórios do GitHub para uma conta de redundância e cold storage seguro, com blindagem de privacidade (*OpSec / Privacy by Design*).

## Visão Geral

O projeto automatiza a proteção de ativos de código e contingência operacional contra exclusões acidentais, comprometimento de contas ou falhas de provedor. Utilizando uma arquitetura multi-contas autenticada via Octokit e Git CLI nativo:

- **Espelhamento Bare Git Completo:** Clona e empurra todo o grafo de branches (`refs/heads/*`) e tags (`refs/tags/*`), preservando 100% dos hashes SHA originais.
- **Detecção de Drift Multi-Dimensional:** Compara estado de código, branch padrão, metadados ("About") e releases antes de acionar o espelhamento, evitando downloads desnecessários e reduzindo a execução para milissegundos.
- **Auto-Provisionamento Resiliente:** Criação automática de repositórios bare estritamente privados com retentativas de *backoff* exponencial e *throttling* contra limites secundários da API (*Secondary Rate Limits*).
- **Cold Storage Seguro:** Desativação automática de workflows do GitHub Actions na conta de backup para evitar execuções redundantes, loops ou custos imprevistos.
- **Governança de Retenção (Soft Delete de 30 Dias):** Repositórios excluídos na conta principal são arquivados e renomeados no formato `DELETED_YYYY-MM-DD_<name>` com trava de segurança de 100 caracteres, garantindo 30 dias de recuperação antes do expurgo definitivo.
- **Blindagem OpSec e Modo Stealth (*Zero-Knowledge Footprint*):** Projetado para operar em repositórios públicos de portfólio sem expor dados confidenciais:
  - Mascaramento da conta de backup como `[CONFIDENTIAL_STORAGE]`.
  - Sincronização de repositórios privados em lote silencioso, sem revelar nomes, contagens ou rastros de superfície (*Information Leakage*).
  - Exibição nominal e detalhada apenas para os projetos públicos.
- **Dashboard de Auditoria Nativo ($GITHUB_STEP_SUMMARY):** Geração dinâmica de relatório executivo em Markdown renderizado diretamente na aba Actions do GitHub, sem gerar commits nem inflar o repositório.

## Destaques Arquiteturais e Funcionalidades

### 1. Motor de Espelhamento Bare Git (`mirror.service.ts`)
O espelhamento utiliza repositórios bare (`git clone --bare`) intermediários temporários. Para contornar a rejeição de referências internas não graváveis do GitHub (`refs/pull/*`), o push aplica um refspec explícito e seguro:
```bash
git push --prune --force <backup_url> refs/heads/*:refs/heads/* refs/tags/*:refs/tags/*
```
Em caso de falha de rede ou subprocesso, credenciais e tokens em URLs remotas são rigorosamente sanitizados e substituídos por `***` antes de qualquer registro em log. Os diretórios temporários (`temp_mirrors/`) são limpos de forma garantida no bloco `finally`.

### 2. Detecção de Drift Incremental (`metadata.service.ts`)
Antes de transferir dados Git, o bot executa uma auditoria comparativa rápida (*Multi-Dimensional Drift Detection*):
1. **Existência remota:** Se o repositório não existe no destino, inicia o espelhamento imediatamente.
2. **Commit SHA da Default Branch:** Compara o hash SHA da branch principal na origem e no destino.
3. **Carimbo de Atualização (`pushed_at`):** Detecta novos pushes ocorridos na conta de origem.
4. **Metadados do Repositório:** Compara descrição, homepage e tópicos.
5. **Releases e Tags:** Compara títulos, corpos em Markdown e tags de releases existentes.

Se todos os critérios forem idênticos, a sincronização é ignorada em milissegundos (`[SKIP]`), poupando banda e recursos de computação.

### 3. Política de Retenção e Soft Delete de 30 Dias (`backup.service.ts`)
Exclusões na origem não resultam em deleção imediata no destino:
- O robô detecta repositórios que existem no backup mas deixaram de existir na origem.
- Renomeia o repositório para `DELETED_YYYY-MM-DD_<nome>` (calculando 30 dias à frente).
- Trava de 100 caracteres: trunca o nome original com segurança caso o prefixo exceda o limite de nomes do GitHub.
- Arquiva o repositório (`archived: true`) tornando-o somente-leitura.
- Após o término do prazo de 30 dias, o robô executa a purga definitiva de forma controlada.

### 4. Blindagem de Privacidade e OpSec (Modo Stealth)
Em esteiras de CI/CD em repositórios públicos, os logs de execução e a aba Actions são 100% públicos. Para conciliar exibição de portfólio profissional e confidencialidade absoluta:
- A conta de redundância nunca é revelada em logs (identificada como `[CONFIDENTIAL_STORAGE]`).
- Os repositórios privados são sincronizados com toda a redundância binária em segundo plano, mas agrupados em um status único `Secured & Synchronized (Stealth Mode)`.
- Nenhuma contagem total ou pista aritmética é exposta, impedindo que terceiros descubram a quantidade ou identidade de repositórios confidenciais.

## Gestão Ágil e Governança com Jira Software

O desenvolvimento seguiu rigorosamente o padrão corporativo de engenharia e governança ágil no **Jira Software** (Chave do Projeto: **`GRMB`**):

- **Estrutura de Backlog:** Decomposto em 3 Épicos (`GRMB-1` a `GRMB-3`) e 8 User Stories técnicas (`GRMB-4` a `GRMB-11`).
- **Rastreabilidade Git:** Commits semânticos no padrão *Conventional Commits* vinculados aos cards do Jira (ex: `GRMB-10: feat: implement execution audit report...`).
- **Ciclo Git-Flow:** Desenvolvimento isolado em feature branches com revisão técnica e checkpoints conceituais antes de cada integração na `main`.

## Arquitetura do Repositório

```text
github-repo-mirror-backup/
├── .github/
│   └── workflows/
│       └── mirror-backup.yml      # Workflow agendado (cron) e manual
├── src/
│   ├── config/
│   │   └── octokit.ts             # Clientes autenticados com fail-fast e logger silencioso
│   ├── services/
│   │   ├── backup.service.ts      # Auto-provisionamento resiliente e soft-delete de 30 dias
│   │   ├── github.service.ts      # Descoberta e paginação de repositórios da origem
│   │   ├── metadata.service.ts    # Drift detection multi-dimensional, releases e cold storage
│   │   ├── mirror.service.ts      # Motor bare git mirror com refspec seguro e sanitização
│   │   └── report.service.ts      # Resumo no terminal e Markdown Job Summary no Actions
│   ├── types/
│   │   └── repository.type.ts     # Interfaces e tipos de dados de repositórios
│   └── index.ts                   # Orquestrador da pipeline com suporte a Modo Stealth
├── .env.example                   # Modelo de variáveis de ambiente com placeholders
├── .gitignore                     # Proteção estrita contra credenciais e arquivos temporários
├── package.json                   # Dependências e scripts de automação
├── tsconfig.json                  # Configuração TypeScript NodeNext estrita
└── README.md                      # Documentação técnica do projeto
```

## Execução Local

### 1. Pré-requisitos
- Node.js 22 LTS ou superior
- Git CLI instalado e acessível no `PATH`
- Dois Personal Access Tokens (PAT) do GitHub com escopo `repo` (um para a conta principal e outro para a conta de backup)

### 2. Configuração do Ambiente
Clone o repositório e configure as credenciais:
```bash
git clone https://github.com/giovanemedeiros/github-repo-mirror-backup.git
cd github-repo-mirror-backup
npm install
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:
```env
SOURCE_GITHUB_TOKEN=seu_token_pat_da_conta_principal
SOURCE_GITHUB_USERNAME=seu_usuario_principal

BACKUP_GITHUB_TOKEN=seu_token_pat_da_conta_de_backup
BACKUP_GITHUB_USERNAME=seu_usuario_de_backup
```

### 3. Comandos de Execução
```bash
# Execução em ambiente de desenvolvimento (TypeScript direto na memória via tsx):
npm run dev

# Compilação formal para produção (Gera pasta dist/):
npm run build

# Execução do bundle JavaScript compilado:
npm run start
```

## Automação e Esteira CI/CD (GitHub Actions)

A esteira de sincronização contínua opera de forma autônoma na nuvem em [.github/workflows/mirror-backup.yml](.github/workflows/mirror-backup.yml):

### 1. Configuração dos Segredos (*Repository Secrets*)
No repositório do GitHub, acesse **Settings > Secrets and variables > Actions** e cadastre:
- `SOURCE_GITHUB_TOKEN`: PAT da conta de origem.
- `BACKUP_GITHUB_TOKEN`: PAT da conta de backup.

### 2. Gatilhos de Execução
- **Agendamento Diário (Cron):** Executa automaticamente todos os dias às **04:00 UTC** (**01:00 BRT**), mantendo a contingência sempre atualizada e defasada para evitar filas no provedor.
- **Disparo Manual (*Workflow Dispatch*):** Pode ser executado sob demanda a qualquer instante pela interface web do GitHub Actions com um clique em **Run workflow**.
