import type { Request, Response } from 'express';

jest.mock('@/services/AttachmentService', () => ({
  AttachmentService: jest.fn(),
}));

jest.mock('@/middleware/verify-starship-access', () => ({
  verifyStarshipAccess: jest.fn(),
  verifyResourceAccess: jest.fn(),
}));

import attachmentsRouter from '@/routes/attachments';
import { AttachmentService } from '@/services/AttachmentService';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';

type MockRes = {
  status: jest.Mock<Response, [number]>;
  json: jest.Mock<Response, [unknown]>;
  setHeader: jest.Mock<Response, [string, string]>;
  write: jest.Mock<Response, [Buffer]>;
  end: jest.Mock<Response, []>;
  send: jest.Mock<Response, [unknown]>;
  redirect: jest.Mock<Response, [string]>;
};

function createMockRes(): MockRes {
  const res: MockRes = {
    status: jest.fn<Response, [number]>(),
    json: jest.fn<Response, [unknown]>(),
    setHeader: jest.fn<Response, [string, string]>(),
    write: jest.fn<Response, [Buffer]>(),
    end: jest.fn<Response, []>(),
    send: jest.fn<Response, [unknown]>(),
    redirect: jest.fn<Response, [string]>(),
  };
  res.status.mockImplementation(() => res as unknown as Response);
  res.json.mockImplementation(() => res as unknown as Response);
  res.setHeader.mockImplementation(() => res as unknown as Response);
  res.write.mockImplementation(() => res as unknown as Response);
  res.end.mockImplementation(() => res as unknown as Response);
  res.send.mockImplementation(() => res as unknown as Response);
  res.redirect.mockImplementation(() => res as unknown as Response);
  return res;
}

function getHandler(path: string): (req: Request, res: Response) => Promise<void> {
  const layer = (attachmentsRouter as any).stack.find((l: any) => l?.route?.path === path);
  if (!layer) throw new Error(`Route not found: ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('attachments routes - presigned upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /uploads/presigned-url uploads attachment via PUT', async () => {
    const mockSvc = {
      getAttachmentWithUrl: jest.fn(),
    };
    (AttachmentService as unknown as jest.Mock).mockImplementation(() => mockSvc);
    (verifyStarshipAccess as unknown as jest.Mock).mockResolvedValue(true);

    mockSvc.getAttachmentWithUrl.mockResolvedValue({
      id: 'att_1234567890',
      filename: 'file.txt',
      mimeType: 'text/plain',
      sizeBytes: 3,
      createdAt: new Date().toISOString(),
      url: 'https://example-bucket.s3.amazonaws.com/presigned-download',
      s3Key: 'starship-s1/conv-c1/123_file.txt',
    });

    const originalFetch = global.fetch;
    // 1) download from storage, 2) upload to destination
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      )
      .mockResolvedValueOnce(
        new Response('', {
          status: 200,
        })
      ) as any;

    const req = {
      user: { id: 'u1' },
      authContext: { userId: 'u1', starshipId: 's1' },
      body: {
        attachmentId: 'att_1234567890',
        presignedUrl: 'https://uploads.example.com/put',
        method: 'PUT',
        bodyMode: 'raw',
        contentType: 'text/plain',
      },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/uploads/presigned-url');
    await handler(req, res as unknown as Response);

    expect(verifyStarshipAccess).toHaveBeenCalledWith('s1', 'u1', expect.anything());
    expect(mockSvc.getAttachmentWithUrl).toHaveBeenCalledWith('att_1234567890', 's1');
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.ok).toBe(true);
    expect(payload.data.method).toBe('PUT');

    global.fetch = originalFetch;
  });

  it('POST /uploads/presigned-url uploads attachment via POST multipart with fields', async () => {
    const mockSvc = {
      getAttachmentWithUrl: jest.fn(),
    };
    (AttachmentService as unknown as jest.Mock).mockImplementation(() => mockSvc);
    (verifyStarshipAccess as unknown as jest.Mock).mockResolvedValue(true);

    mockSvc.getAttachmentWithUrl.mockResolvedValue({
      id: 'att_1234567890',
      filename: 'file.txt',
      mimeType: 'text/plain',
      sizeBytes: 3,
      createdAt: new Date().toISOString(),
      url: 'https://example-bucket.s3.amazonaws.com/presigned-download',
      s3Key: 'starship-s1/conv-c1/123_file.txt',
    });

    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 204 })
      ) as any;

    const req = {
      user: { id: 'u1' },
      authContext: { userId: 'u1', starshipId: 's1' },
      body: {
        attachmentId: 'att_1234567890',
        presignedUrl: 'https://uploads.example.com/post',
        method: 'POST',
        bodyMode: 'multipart',
        fields: { key: 'abc', policy: 'xyz' },
        fileFieldName: 'file',
      },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/uploads/presigned-url');
    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.ok).toBe(true);
    expect(payload.data.method).toBe('POST');

    global.fetch = originalFetch;
  });

  it('POST /uploads/presigned-url uploads raw bytes when bodyMode=raw (LinkedIn-style)', async () => {
    const mockSvc = {
      getAttachmentWithUrl: jest.fn(),
    };
    (AttachmentService as unknown as jest.Mock).mockImplementation(() => mockSvc);
    (verifyStarshipAccess as unknown as jest.Mock).mockResolvedValue(true);

    mockSvc.getAttachmentWithUrl.mockResolvedValue({
      id: 'att_1234567890',
      filename: 'image.png',
      mimeType: 'image/png',
      sizeBytes: 3,
      createdAt: new Date().toISOString(),
      url: 'https://example-bucket.s3.amazonaws.com/presigned-download',
      s3Key: 'starship-s1/conv-c1/123_image.png',
    });

    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 })) as any;
    global.fetch = fetchMock;

    const req = {
      user: { id: 'u1' },
      authContext: { userId: 'u1', starshipId: 's1' },
      body: {
        attachmentId: 'att_1234567890',
        presignedUrl: 'https://www.linkedin.com/dms-uploads/uploaded-image/0',
        method: 'POST',
        bodyMode: 'raw',
        contentType: 'image/png',
      },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/uploads/presigned-url');
    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const secondCall = fetchMock.mock.calls[1];
    const init = secondCall?.[1] as any;
    expect(init.method).toBe('POST');
    // In raw mode we send bytes directly, not FormData.
    expect(init.body).toBeInstanceOf(ArrayBuffer);

    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.bodyMode).toBe('raw');

    global.fetch = originalFetch;
  });
});

