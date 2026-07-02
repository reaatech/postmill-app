import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DesignerDocService } from './designer-doc.service';
import { createBlankDoc } from './designer-doc.migrate';
import { DesignerDocOpError } from './designer-doc.errors';

const makeService = () => new DesignerDocService();

const minimalImageElement = {
  type: 'text' as const,
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  text: 'Hello',
};

describe('DesignerDocService', () => {
  it('validates and clamps a legacy doc leniently', () => {
    const service = makeService();
    const raw = {
      version: 2,
      mode: 'image',
      outputs: [
        {
          id: 'out-1',
          formatId: 'custom',
          name: 'Custom',
          width: 999999,
          height: 1080,
          background: '#ffffff',
          children: [
            {
              id: 'el-1',
              type: 'text',
              x: 0,
              y: 0,
              width: 100,
              height: 50,
              rotation: 0,
              opacity: 2,
              locked: false,
              hidden: false,
            },
          ],
        },
      ],
    };
    const doc = service.validate(raw);
    expect(doc.outputs[0].width).toBe(16384);
    expect(doc.outputs[0].children[0].opacity).toBe(1);
  });

  it('applies addOutput and creates a new image output', () => {
    const service = makeService();
    const doc = createBlankDoc();
    const result = service.applyOps(doc, [
      {
        op: 'addOutput',
        preset: {
          formatId: 'instagram-portrait',
          name: 'Instagram Portrait',
          width: 1080,
          height: 1350,
        },
      },
    ]);
    expect(result.outputs).toHaveLength(2);
    const added = result.outputs[1] as any;
    expect(added.width).toBe(1080);
    expect(added.height).toBe(1350);
    expect(added.formatId).toBe('instagram-portrait');
    expect(added.id).toMatch(/^out-[0-9a-f-]{36}$/i);
  });

  it('applies addElement and assigns ids/originId', () => {
    const service = makeService();
    const doc = createBlankDoc();
    const result = service.applyOps(doc, [
      {
        op: 'addElement',
        outputIndex: 0,
        element: minimalImageElement,
      },
    ]);
    const el = (result.outputs[0] as any).children[0];
    expect(el.id).toMatch(/^el-[0-9a-f-]{36}$/i);
    expect(el.originId).toBe(el.id);
    expect(el.text).toBe('Hello');
  });

  it('applies updateElement patch and preserves type/id', () => {
    const service = makeService();
    let doc = createBlankDoc();
    doc = service.applyOps(doc, [
      {
        op: 'addElement',
        outputIndex: 0,
        element: minimalImageElement,
      },
    ]);
    const id = (doc.outputs[0] as any).children[0].id;
    const result = service.applyOps(doc, [
      {
        op: 'updateElement',
        outputIndex: 0,
        elementId: id,
        patch: { text: 'World' },
      },
    ]);
    const el = (result.outputs[0] as any).children[0];
    expect(el.text).toBe('World');
    expect(el.type).toBe('text');
    expect(el.id).toBe(id);
  });

  it('rejects updateElement patch containing id/originId/type', () => {
    const service = makeService();
    const doc = createBlankDoc();
    const result = service.applyOps.safeParse?.(doc, [
      {
        op: 'updateElement',
        outputIndex: 0,
        elementId: 'el-1',
        patch: { id: 'new-id' },
      },
    ] as any);
    // applyOps does not expose safeParse; it throws on bad ops.
    expect(() =>
      service.applyOps(doc, [
        {
          op: 'updateElement',
          outputIndex: 0,
          elementId: 'el-1',
          patch: { id: 'new-id' },
        } as any,
      ])
    ).toThrow();
  });

  it('assigns ids on a video output clip', () => {
    const service = makeService();
    const doc = {
      version: 2,
      mode: 'video' as const,
      outputs: [
        {
          formatId: 'reels',
          name: 'Reels',
          width: 1080,
          height: 1920,
          fps: 30,
          durationMs: 10000,
          tracks: [
            {
              type: 'video' as const,
              clips: [{ startMs: 0, endMs: 10000 } as any],
            },
          ],
        },
      ],
    };
    const result = service.assignIdsAndNormalize(doc as any);
    const clip = (result.outputs[0] as any).tracks[0].clips[0];
    expect(clip.id).toMatch(/^clip-[0-9a-f-]{36}$/i);
    expect(clip.originId).toBe(clip.id);
  });

  it('throws DesignerDocOpError for image-only op on video output', () => {
    const service = makeService();
    const doc = {
      version: 2,
      mode: 'video' as const,
      outputs: [
        {
          id: 'out-v1',
          formatId: 'reels',
          name: 'Reels',
          width: 1080,
          height: 1920,
          fps: 30,
          durationMs: 10000,
          tracks: [{ id: 'trk-1', type: 'video' as const, clips: [] }],
        },
      ],
    };
    expect(() =>
      service.applyOps(doc, [
        {
          op: 'setOutputBackground',
          outputIndex: 0,
          background: { type: 'color' as const, color: '#000000' },
        },
      ])
    ).toThrow(DesignerDocOpError);
  });

  it('throws DesignerDocOpError for out-of-range outputIndex', () => {
    const service = makeService();
    const doc = createBlankDoc();
    expect(() =>
      service.applyOps(doc, [
        {
          op: 'addElement',
          outputIndex: 5,
          element: minimalImageElement,
        },
      ])
    ).toThrow(DesignerDocOpError);
  });

  it('throws BadRequestException for a bad field value in an op', () => {
    const service = makeService();
    const doc = createBlankDoc();
    expect(() =>
      service.applyOps(doc, [
        {
          op: 'placeImage',
          outputIndex: 0,
          src: 'not-a-url',
        } as any,
      ])
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for too many ops', () => {
    const service = makeService();
    const doc = createBlankDoc();
    const ops = Array(201).fill({
      op: 'removeOutput',
      outputIndex: 0,
    });
    expect(() => service.applyOps(doc, ops as any)).toThrow(
      BadRequestException
    );
  });

  it('a lenient base with passthrough keys survives applyOps', () => {
    const service = makeService();
    const doc = service.validate({
      version: 2,
      mode: 'image',
      outputs: [
        {
          id: 'out-1',
          formatId: 'custom',
          name: 'Custom',
          width: 100,
          height: 100,
          background: '#ffffff',
          children: [],
          _legacyKey: 'keep-me',
        },
      ],
    });
    const result = service.applyOps(doc, [
      { op: 'addElement', outputIndex: 0, element: minimalImageElement },
    ]);
    expect((result.outputs[0] as any)._legacyKey).toBe('keep-me');
  });

  it('buildPlaceImageOp constructs a valid op', () => {
    const service = makeService();
    const op = service.buildPlaceImageOp({
      outputIndex: 0,
      src: 'http://localhost:3000/uploads/test.png',
      fileId: 'file-1',
    });
    expect(op.op).toBe('placeImage');
    expect(op.src).toBe('http://localhost:3000/uploads/test.png');
    expect(op.fileId).toBe('file-1');
  });
});
