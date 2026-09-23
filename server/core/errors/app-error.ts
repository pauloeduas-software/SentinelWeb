export class AppError extends Error {
  status: number;
  // Campos extras que vão junto na resposta (ex.: o `hwid` do agente offline)
  details?: Record<string, unknown>;

  constructor(message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}
