# SentinelWeb - Painel de Controle Sentinel (Sentinel v2.0)

O **SentinelWeb** é o cockpit administrativo do ecossistema. Ele transforma dados brutos de telemetria em insights acionáveis através de uma interface moderna de alta densidade de informação, permitindo o gerenciamento em tempo real de frotas de ativos.

## 🚀 Funcionalidades Principais

### 1. Interface Enterprise Dark Mode
- **Design de Alta Performance**: Estética limpa inspirada em ferramentas como Vercel e Linear.
- **Real-time Updates**: Polling inteligente que atualiza métricas a cada 5 segundos sem recarregar a interface.
- **Asset Cards**: Visão consolidada por máquina com badges pulsantes de status.

### 2. Monitoramento de Performance Visual
- **CPU Sparklines**: Gráficos de linha históricos que mostram a tendência de uso dos últimos minutos.
- **RAM Donuts**: Visualização circular intuitiva do consumo de memória.
- **Storage Progress**: Barras de progresso semânticas (Verde/Laranja/Vermelho) para cada partição de disco.

### 3. Gestão e Inventário (ITAM/RMM)
- **Painel de Ações Remotas**: Botões integrados para disparar comandos de `Reboot`, `Shutdown` e `Suspend` diretamente pelo navegador.
- **Software Inventory Modal**: Explorador de programas instalados com motor de busca e filtragem em tempo real.
- **System Specs**: Exposição imediata de IP Local, MAC Address e Versão do OS.

## 🛠️ Stack Tecnológica
- **Framework**: React 18+
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4 (Design utilitário)
- **Gráficos**: Recharts
- **Ícones**: Lucide React
- **Comunicação**: Axios

## 📁 Estrutura do Projeto
- `src/App.tsx`: Orquestração principal, gerenciamento de polling e grid de ativos.
- `src/components/`: Componentes reutilizáveis (Modais, Barras de Progresso, Sparklines).
- `src/index.css`: Definições globais de Tailwind e temas.

## ⚙️ Como Rodar
1. **Instalação**: `npm install`
2. **Execução**:
   ```bash
   npm run dev
   ```

## 🛡️ Programação Defensiva (UI)
A interface possui lógica de resiliência integrada para lidar com variações de dados entre Windows e Linux, suportando chaves de JSON em múltiplos formatos (Pascal/camelCase) e realizando conversões automáticas de unidades (Bytes -> GB).
