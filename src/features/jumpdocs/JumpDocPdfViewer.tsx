import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { JumpDocPdfAnnotation } from '../../domain/jumpdoc/types';
import { createId } from '../../utils/id';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface JumpDocPdfViewerProps {
  source: string | null;
  fileName?: string;
  annotations: JumpDocPdfAnnotation[];
  onAnnotationsChange: (annotations: JumpDocPdfAnnotation[]) => void;
}

interface DraftRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getNormalizedPointerPosition(event: PointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: clampUnit((event.clientX - rect.left) / rect.width),
    y: clampUnit((event.clientY - rect.top) / rect.height),
  };
}

function getRectStyle(rect: JumpDocPdfAnnotation | DraftRect) {
  const left = 'x' in rect ? rect.x : Math.min(rect.startX, rect.currentX);
  const top = 'y' in rect ? rect.y : Math.min(rect.startY, rect.currentY);
  const width = 'width' in rect ? rect.width : Math.abs(rect.currentX - rect.startX);
  const height = 'height' in rect ? rect.height : Math.abs(rect.currentY - rect.startY);

  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
  };
}

export function JumpDocPdfViewer({ source, fileName, annotations, onAnnotationsChange }: JumpDocPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [documentProxy, setDocumentProxy] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState('No PDF loaded.');
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);

  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.page === pageNumber),
    [annotations, pageNumber],
  );

  useEffect(() => {
    let cancelled = false;
    setDocumentProxy(null);
    setPageNumber(1);
    setCanvasSize({ width: 0, height: 0 });

    if (!source) {
      setStatus('Upload a PDF or enter a browser-readable PDF URL.');
      return;
    }

    setStatus('Loading PDF...');
    const loadingTask = pdfjs.getDocument(source);

    void loadingTask.promise
      .then((nextDocument) => {
        if (cancelled) {
          void nextDocument.destroy();
          return;
        }

        setDocumentProxy(nextDocument);
        setStatus('');
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Unable to load PDF.');
        }
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    if (!documentProxy || !canvas) {
      return;
    }

    renderTaskRef.current?.cancel();
    setStatus('Rendering page...');

    void documentProxy
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');

        if (!context) {
          setStatus('Canvas rendering is unavailable in this browser.');
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasSize({ width: viewport.width, height: viewport.height });

        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = renderTask;

        return renderTask.promise.then(() => {
          if (!cancelled) {
            setStatus('');
          }
        });
      })
      .catch((error: unknown) => {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          setStatus(error instanceof Error ? error.message : 'Unable to render PDF page.');
        }
      });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [documentProxy, pageNumber, scale]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!documentProxy) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const position = getNormalizedPointerPosition(event);
    setDraftRect({
      startX: position.x,
      startY: position.y,
      currentX: position.x,
      currentY: position.y,
    });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draftRect) {
      return;
    }

    const position = getNormalizedPointerPosition(event);
    setDraftRect({
      ...draftRect,
      currentX: position.x,
      currentY: position.y,
    });
  }

  function commitDraftRect() {
    if (!draftRect) {
      return;
    }

    const x = Math.min(draftRect.startX, draftRect.currentX);
    const y = Math.min(draftRect.startY, draftRect.currentY);
    const width = Math.abs(draftRect.currentX - draftRect.startX);
    const height = Math.abs(draftRect.currentY - draftRect.startY);

    setDraftRect(null);

    if (width < 0.01 || height < 0.01) {
      return;
    }

    onAnnotationsChange([
      ...annotations,
      {
        id: createId('pdf_annotation'),
        label: `Page ${pageNumber} marker ${pageAnnotations.length + 1}`,
        notes: '',
        page: pageNumber,
        x,
        y,
        width,
        height,
      },
    ]);
  }

  function removeAnnotation(annotationId: string) {
    onAnnotationsChange(annotations.filter((annotation) => annotation.id !== annotationId));
  }

  return (
    <section className="jumpdoc-pdf-viewer stack" aria-label="PDF reader">
      <div className="jumpdoc-pdf-toolbar">
        <div>
          <strong>{fileName ?? 'PDF reader'}</strong>
          {documentProxy ? <span>{documentProxy.numPages} pages</span> : null}
        </div>
        <div className="actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={!documentProxy || pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="pill">Page {documentProxy ? pageNumber : '-'} / {documentProxy?.numPages ?? '-'}</span>
          <button
            className="button button--secondary"
            type="button"
            disabled={!documentProxy || pageNumber >= documentProxy.numPages}
            onClick={() => setPageNumber((current) => documentProxy ? Math.min(documentProxy.numPages, current + 1) : current)}
          >
            Next
          </button>
          <button className="button button--secondary" type="button" disabled={!documentProxy} onClick={() => setScale((current) => Math.max(0.6, Number((current - 0.15).toFixed(2))))}>
            Zoom out
          </button>
          <button className="button button--secondary" type="button" disabled={!documentProxy} onClick={() => setScale((current) => Math.min(2.5, Number((current + 0.15).toFixed(2))))}>
            Zoom in
          </button>
        </div>
      </div>

      {status ? <p className="muted">{status}</p> : null}

      <div className="jumpdoc-pdf-scroll">
        <div className="jumpdoc-pdf-page" style={{ width: canvasSize.width || undefined }}>
          <canvas ref={canvasRef} />
          {documentProxy && canvasSize.width > 0 ? (
            <div
              className="jumpdoc-pdf-overlay"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={commitDraftRect}
              onPointerCancel={() => setDraftRect(null)}
            >
              {pageAnnotations.map((annotation) => (
                <div key={annotation.id} className="jumpdoc-pdf-annotation" style={getRectStyle(annotation)}>
                  <span>{annotation.label}</span>
                </div>
              ))}
              {draftRect ? <div className="jumpdoc-pdf-annotation is-draft" style={getRectStyle(draftRect)} /> : null}
            </div>
          ) : null}
        </div>
      </div>

      {documentProxy ? (
        <div className="stack stack--compact">
          <p className="muted">Drag on the page to save a local annotation bound.</p>
          {pageAnnotations.length > 0 ? (
            <div className="selection-list selection-list--compact">
              {pageAnnotations.map((annotation) => (
                <div key={annotation.id} className="selection-list__item">
                  <strong>{annotation.label}</strong>
                  <span>{Math.round(annotation.width * 100)}% x {Math.round(annotation.height * 100)}%</span>
                  <button className="button button--secondary" type="button" onClick={() => removeAnnotation(annotation.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
