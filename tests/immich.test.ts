import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));

import { requestUrl } from 'obsidian';
import { ImmichClient } from '../src/immich';
import { Calendar } from '../src/calendar';
import { DEFAULT_SETTINGS } from '../src/config';

const mock = requestUrl as unknown as ReturnType<typeof vi.fn>;
const on = { ...DEFAULT_SETTINGS, immichEnabled: true, immichUrl: 'https://p.example', immichApiKey: 'KEY', immichPageSize: 123 };
const cal = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 21, endAge: 100 });

beforeEach(() => mock.mockReset());

describe('ImmichClient', () => {
  it('available gates on enabled+url+key', () => {
    expect(new ImmichClient(on).available).toBe(true);
    expect(new ImmichClient({ ...on, immichEnabled: false }).available).toBe(false);
    expect(new ImmichClient({ ...on, immichUrl: '' }).available).toBe(false);
    expect(new ImmichClient({ ...on, immichApiKey: '' }).available).toBe(false);
  });

  it('searchWeek posts the 7-day window', async () => {
    mock.mockResolvedValue({ status: 200, json: { assets: { items: [{ id: 'a', type: 'IMAGE' }], total: 9 } } });
    const r = await new ImmichClient(on).searchWeek(cal, 21, 1);
    expect(r).toEqual({ items: [{ id: 'a', type: 'IMAGE' }], total: 9 });
    const arg = mock.mock.calls[0][0];
    expect(arg.url).toBe('https://p.example/api/search/metadata');
    expect(arg.method).toBe('POST');
    expect(arg.headers['x-api-key']).toBe('KEY');
    const body = JSON.parse(arg.body);
    expect(body.takenAfter).toBe(new Date(2021, 0, 1).toISOString());
    expect(body.takenBefore).toBe(new Date(2021, 0, 8).toISOString());
    expect(body.size).toBe(123);
    expect(body.order).toBe('asc');
  });

  it('searchWeek tolerates empty response', async () => {
    mock.mockResolvedValue({ status: 200, json: {} });
    expect(await new ImmichClient(on).searchWeek(cal, 21, 1)).toEqual({ items: [], total: 0 });
  });

  it('non-2xx rejects', async () => {
    mock.mockResolvedValue({ status: 500 });
    await expect(new ImmichClient(on).searchWeek(cal, 21, 1)).rejects.toThrow('Immich 500 on /api/search/metadata');
  });

  it('thumbnail and original fetch binary', async () => {
    const buf = new ArrayBuffer(4);
    mock.mockResolvedValue({ status: 200, arrayBuffer: buf });
    const c = new ImmichClient(on);
    expect(await c.thumbnail('x1', 'preview')).toBe(buf);
    expect(mock.mock.calls[0][0].url).toBe('https://p.example/api/assets/x1/thumbnail?size=preview');
    expect(await c.thumbnail('x1')).toBe(buf);
    expect(mock.mock.calls[1][0].url).toBe('https://p.example/api/assets/x1/thumbnail');
    expect(await c.original('x1')).toBe(buf);
    expect(mock.mock.calls[2][0].url).toBe('https://p.example/api/assets/x1/original');
    expect(mock.mock.calls[2][0].method).toBe('GET');
  });
});
