# Sentinel Web Dashboard 📊
> **Cyber-Industrial Control Panel for Fleet Management**

![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-3.x-38B2AC?logo=tailwind-css)

O **Sentinel Web** fornece a interface visual para o gerenciamento de ativos. É focado em densidade de informação e baixa latência de resposta.

## 📁 Detalhamento de Componentes e Arquivos

### `src/components/`
*   **`AssetDetailModal.tsx`**: O componente mais complexo. Realiza o parse profundo dos payloads JSON da API, renderiza os gráficos de telemetria, lista processos agrupados e contém a interface de disparo de comandos (`shutdown`, `lock`).
*   **`AssetCard.tsx`**: Visualização resumida do status e métricas críticas de cada servidor na lista principal.

### `src/`
*   **`App.tsx`**: Orquestrador da UI. Gerencia o polling global de ativos e o estado da lista de máquinas monitoradas.
*   **`types.ts`**: Contrato de tipos (TypeScript). Define rigorosamente as interfaces `Asset`, `Telemetry`, `NetworkMetrics`, etc., garantindo que o Frontend esteja em sincronia com o Agente C#.

### `Styles`
*   **`index.css`**: Define o tema **Cyber-Industrial** utilizando variáveis CSS do Tailwind para o modo escuro, cores de status (`success`, `warning`, `error`) e fontes monoespaçadas.

## 🚀 Funcionalidades da UI
*   **Grid de Rede 2x2**: Visualização minimalista de tráfego (Velocidade Kbps + Totais GB).
*   **Lista de Ativos Dinâmica**: Filtros automáticos por status ONLINE/OFFLINE.
*   **Execução Direta**: Disparo de comandos de nível de Kernel com confirmação de segurança.

## 📋 Requisitos
*   Node.js v22.x ou superior
*   Bun (Gerenciador de pacotes)

## 🛠️ Desenvolvimento

```bash
# 1. Instalação
bun install

# 2. Rodar modo dev (Vite)
bun run dev
```
