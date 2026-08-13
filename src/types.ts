export interface DiskMetrics { name: string; totalGb: number; usedGb: number; }
export interface NetworkMetrics { bytesReceived: number; bytesSent: number; }
export interface ProcessMetrics { pid: number; name: string; ramMb: number; }
export interface Telemetry { cpuUsage: number; ramTotal: string; ramUsed: string; disks?: any; network?: any; topProcesses?: any; timestamp: string; }
export interface Asset { id: string; hwid: string; hostname: string; osVersion: string; macAddress?: string; localIp?: string; status: string; telemetries: Telemetry[]; }

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  category: string;
  status: string;
  assignedToId?: string | null;
  assignedTo?: User | null;
  folderId?: string | null;
  folder?: Folder | null;
  notes?: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  createdAt: string;
}
