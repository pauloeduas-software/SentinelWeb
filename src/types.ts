export interface DiskMetrics { name: string; totalGb: number; usedGb: number; }
export interface NetworkMetrics { bytesReceived: number; bytesSent: number; }
export interface ProcessMetrics { pid: number; name: string; ramMb: number; }
export interface Telemetry { cpuUsage: number; ramTotal: string; ramUsed: string; disks?: any; network?: any; topProcesses?: any; timestamp: string; }
export interface Asset { id: string; hwid: string; hostname: string; osVersion: string; macAddress?: string; localIp?: string; status: string; telemetries: Telemetry[]; }
