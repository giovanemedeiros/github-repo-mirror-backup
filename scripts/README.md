# Agendamento Externo de Alta Prioridade (Google Apps Script)

Este diretório contém o template oficial ([`gas-trigger.template.js`](gas-trigger.template.js)) para acionar a esteira de backup do GitHub Actions via API REST (`workflow_dispatch`), garantindo execução pontual durante a janela de manutenção da madrugada (**04:00 às 05:00 BRT**).

## Por que utilizar um gatilho externo via API?

No GitHub Actions, eventos nativos do tipo `on: schedule` (cron interno) são alocados em uma fila compartilhada de baixa prioridade que frequentemente sofre atrasos de várias horas (ou descarte de execução) em horários de pico global.

Já os eventos do tipo **`workflow_dispatch`** (acionados manualmente ou via requisição autenticada na API REST do GitHub) são direcionados imediatamente para a **fila de alta prioridade**, iniciando a execução em poucos segundos e garantindo o *Recovery Point Objective (RPO)* diário na madrugada.

## Passo a Passo de Configuração no Google Apps Script

O **Google Apps Script** é uma plataforma serverless gratuita da própria conta Google (integrada ao Google Drive) que permite agendar e executar funções JavaScript na nuvem sem expor credenciais a serviços de terceiros.

### 1. Verificar Permissões do Token no GitHub (PAT)
Certifique-se de que o seu **Personal Access Token (classic)** da conta principal do GitHub possui os dois escopos abaixo marcados:
- `repo` (Controle total de repositórios privados e públicos)
- `workflow` (Permissão para acionar e gerenciar workflows do GitHub Actions via API)

### 2. Criar o Projeto no Google Apps Script
1. Acesse [script.google.com](https://script.google.com) autenticado na sua conta Google.
2. Clique em **Novo projeto** (*New project*).
3. Renomeie o projeto no topo para `github-repo-mirror-backup`.
4. No editor (`Código.gs` / `Code.gs`), apague o conteúdo padrão e cole o código do arquivo [`gas-trigger.template.js`](gas-trigger.template.js).
5. Pressione `Ctrl + S` (ou clique no ícone de disquete) para salvar.

### 3. Configurar as Variáveis de Ambiente (*Script Properties*)
Para manter total segurança (OpSec) e não inserir credenciais diretamente no código:
1. No menu lateral esquerdo do Google Apps Script, clique no ícone de engrenagem (**Configurações do projeto** / *Project Settings*).
2. Confirme se o fuso horário do projeto está definido como `(GMT-03:00) Horário Padrão de Brasília - São Paulo`.
3. Role até o final da página na seção **Propriedades do script** (*Script Properties*) e clique em **Adicionar propriedade do script**:
   - **Propriedade 1:** `GITHUB_TOKEN` | **Valor:** `seu_personal_access_token_do_github`
   - **Propriedade 2:** `GITHUB_OWNER` | **Valor:** `seu_usuario_do_github`
4. Clique em **Salvar propriedades do script**.

### 4. Testar e Autorizar a Execução
1. Volte ao menu lateral **Editor** (`< >`).
2. Na barra superior, verifique se a função `triggerMirrorBackupWorkflow` está selecionada e clique em **Executar** (*Run*).
3. Na primeira execução, o Google solicitará permissão para que o seu script se conecte a um serviço externo (`api.github.com`):
   - Clique em **Revisar permissões** > selecione sua conta Google > clique em **Avançado** > **Acessar github-repo-mirror-backup (não seguro)** > **Permitir**.
4. Verifique no **Registro de execução** na parte inferior da tela a mensagem:
   `[SUCCESS] Workflow 'mirror-backup.yml' dispatched successfully...` e confirme na aba **Actions** do GitHub que o workflow iniciou imediatamente.

### 5. Configurar o Range de Horário (Acionador Automático Diário)
O intervalo de horário em que o script rodará todos os dias é configurado diretamente no painel visual de **Acionadores** do Google Apps Script:
1. No menu lateral esquerdo, clique no ícone de relógio (**Acionadores** / *Triggers*).
2. No canto inferior direito, clique no botão **+ Adicionar acionador** (*+ Add Trigger*).
3. Preencha os campos da janela da seguinte forma:
   - **Escolha a função que será executada:** `triggerMirrorBackupWorkflow`
   - **Escolha qual implantação deve ser executada:** `Teste` (*Head*)
   - **Selecione a origem do evento:** `Baseado no tempo` (*Time-driven*)
   - **Selecione o tipo de acionador com base no tempo:** `Contador de dias` (*Day timer*)
   - **Selecione a hora do dia:** `4h às 5h` (*GMT-03:00*)
   - **Configurações de notificação de falha:** `Receber notificações imediatamente`
4. Clique em **Salvar**.

A partir desse momento, todos os dias durante a janela das **04:00 às 05:00 da manhã (Horário de Brasília)**, o Google Apps Script enviará o comando `workflow_dispatch` para a API do GitHub e a esteira de backup rodará instantaneamente na fila de prioridade máxima.
