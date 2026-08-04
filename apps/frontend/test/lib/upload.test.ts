import { putWithProgress } from '@/lib/upload';

/** Minimal XMLHttpRequest stand-in; jsdom's does not run in tests. */
class MockXhr {
    static last: MockXhr;

    status = 200;
    method = '';
    url = '';
    headers: Record<string, string> = {};
    body: unknown = null;

    private listeners: Record<string, Array<() => void>> = {};
    upload = {
        listeners: [] as Array<(event: ProgressEvent) => void>,
        addEventListener(_type: string, handler: (event: ProgressEvent) => void) {
            this.listeners.push(handler);
        },
    };

    constructor() {
        MockXhr.last = this;
    }

    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }
    setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
    }
    addEventListener(type: string, handler: () => void) {
        (this.listeners[type] ??= []).push(handler);
    }
    send(body: unknown) {
        this.body = body;
    }

    emit(type: string) {
        this.listeners[type]?.forEach((handler) => handler());
    }
    emitProgress(loaded: number, lengthComputable = true) {
        this.upload.listeners.forEach((handler) =>
            handler({ loaded, lengthComputable } as ProgressEvent),
        );
    }
}

beforeEach(() => {
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = MockXhr;
});

function pdf() {
    return new File(['x'], 'receipt.pdf', { type: 'application/pdf' });
}

describe('putWithProgress', () => {
    it('PUTs the file to the presigned URL with the signed content type', async () => {
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', () => {});
        MockXhr.last.emit('load');
        await promise;

        expect(MockXhr.last.method).toBe('PUT');
        expect(MockXhr.last.url).toBe('https://signed.example/put');
        expect(MockXhr.last.headers['Content-Type']).toBe('application/pdf');
        expect(MockXhr.last.body).toBeInstanceOf(File);
    });

    it('does not send an Authorization header — the signature is in the URL', async () => {
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', () => {});
        MockXhr.last.emit('load');
        await promise;

        expect(MockXhr.last.headers.Authorization).toBeUndefined();
    });

    it('reports transferred bytes as they arrive', async () => {
        const onProgress = jest.fn();
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', onProgress);

        MockXhr.last.emitProgress(256);
        MockXhr.last.emitProgress(1024);
        MockXhr.last.emit('load');
        await promise;

        expect(onProgress.mock.calls).toEqual([[256], [1024]]);
    });

    it('ignores progress events with no computable length', async () => {
        const onProgress = jest.fn();
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', onProgress);

        MockXhr.last.emitProgress(256, false);
        MockXhr.last.emit('load');
        await promise;

        expect(onProgress).not.toHaveBeenCalled();
    });

    it('rejects on a non-2xx response, carrying the status', async () => {
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', () => {});
        MockXhr.last.status = 403;
        MockXhr.last.emit('load');

        await expect(promise).rejects.toThrow('Upload failed (403)');
    });

    it('rejects on a network error', async () => {
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', () => {});
        MockXhr.last.emit('error');

        await expect(promise).rejects.toThrow('Upload failed');
    });

    it('rejects when the upload is aborted', async () => {
        const promise = putWithProgress('https://signed.example/put', pdf(), 'application/pdf', () => {});
        MockXhr.last.emit('abort');

        await expect(promise).rejects.toThrow('Upload cancelled');
    });
});
