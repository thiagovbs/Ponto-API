import * as express from 'express';

declare global {
  namespace Express {
    interface Request {
      empresaId?: string;
      setorId?: string; // Já deixamos o setor engatilhado também!
    }
  }
}