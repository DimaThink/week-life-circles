import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type { Settings } from './config';
import type { Calendar } from './calendar';

export interface ImmichAsset {
  id: string;
  type: string;
  originalFileName?: string;
  duration?: number;
}

export class ImmichClient {
  constructor(private readonly settings: Settings) {}

  get available(): boolean {
    const s = this.settings;
    return !!s.immichEnabled && s.immichUrl !== '' && s.immichApiKey !== '';
  }

  private async request(path: string, body?: unknown): Promise<RequestUrlResponse> {
    const resp = await requestUrl({
      url: this.settings.immichUrl + path,
      method: body ? 'POST' : 'GET',
      headers: {
        'x-api-key': this.settings.immichApiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Immich ${resp.status} on ${path}`);
    }
    return resp;
  }

  private async binary(path: string): Promise<ArrayBuffer> {
    return (await this.request(path)).arrayBuffer;
  }

  async searchWeek(
    calendar: Calendar,
    yy: number,
    ww: number,
  ): Promise<{ items: ImmichAsset[]; total: number }> {
    const { since, until } = calendar.weekRange(yy, ww);
    const resp = await this.request('/api/search/metadata', {
      takenAfter: since.toISOString(),
      takenBefore: until.toISOString(),
      size: this.settings.immichPageSize,
      order: 'asc',
    });
    const res = resp.json as { assets?: { items?: ImmichAsset[]; total?: number } } | null;
    const items = res?.assets?.items || [];
    return { items, total: res?.assets?.total ?? items.length };
  }

  thumbnail(id: string, size?: 'preview'): Promise<ArrayBuffer> {
    const q = size ? `?size=${size}` : '';
    return this.binary(`/api/assets/${id}/thumbnail${q}`);
  }

  original(id: string): Promise<ArrayBuffer> {
    return this.binary(`/api/assets/${id}/original`);
  }
}
