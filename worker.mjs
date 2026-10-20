import { DurableObject } from 'cloudflare:workers';
import { createUpstreamService, createWorker } from './api.mjs';

// The one global cache: every TenFore and Open-Meteo request happens inside this object.
export class UpstreamCache extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.service = createUpstreamService({ storage: ctx.storage, log: key => console.log('upstream', key) });
  }

  fetch(request) {
    return this.service.fetch(request);
  }
}

export default createWorker();
